//! Persistent guest→host service-line pending queue.
//!
//! `UiSurface::svc_drain()` empties the entire guest→host queue in one call
//! (its contract is drain-all). The host must therefore own the lines it
//! cannot process in the current tick: bounded work per tick is allowed,
//! FIFO is mandatory, silent tail loss is forbidden.

use std::collections::VecDeque;

/// Service lines processed per worker tick. A semantic processing budget,
/// not a drop boundary: lines beyond the budget stay queued in host-owned
/// storage and are processed on later ticks, in arrival order.
pub(crate) const MAX_SVC_LINES_PER_TICK: usize = 64;

/// Diagnostic high-water mark for the pending queue. SvcPending storage is
/// STRUCTURALLY UNBOUNDED: `refill` extends a `VecDeque` with no capacity
/// limit, so this mark is not a hard capacity, not backpressure, and not a
/// memory bound — crossing it never drops anything and never blocks the
/// producer; it only surfaces sustained queue growth once per crossing.
///
/// Why unbounded retention is the accepted design: the only producer is the
/// product's own guest, which emits at most one bounded-scalar command line
/// per user input event (`guest/commands.ts` — `send()` is one `svcSend` per
/// command; no loops emit svc), while this side consumes up to
/// [`MAX_SVC_LINES_PER_TICK`] lines every 60 Hz tick. Sustained growth would
/// require the trusted guest to systematically out-emit that budget, which
/// its event-driven one-line-per-command protocol cannot do. Any drop or
/// truncate policy would be worse: losing a user command is a correctness
/// failure, while queue growth is only a memory symptom with a real product
/// bound on its producer rate.
pub(crate) const SVC_PENDING_HIGH_WATER: usize = 4096;

/// Host-owned storage for guest→host service lines between the surface's
/// drain-all handoff and per-tick processing.
pub(crate) struct SvcPending {
    pending: VecDeque<String>,
}

impl SvcPending {
    pub(crate) fn new() -> Self {
        Self {
            pending: VecDeque::new(),
        }
    }

    /// Take every line the surface drain produced into pending storage,
    /// behind anything still unprocessed from earlier ticks (FIFO).
    pub(crate) fn refill<I: IntoIterator<Item = String>>(&mut self, lines: I) {
        self.pending.extend(lines);
    }

    /// Pop at most `budget` lines from the front for this tick's processing.
    pub(crate) fn take_batch(&mut self, budget: usize) -> VecDeque<String> {
        let n = budget.min(self.pending.len());
        self.pending.drain(0..n).collect()
    }

    pub(crate) fn len(&self) -> usize {
        self.pending.len()
    }

    /// Put unprocessed lines back at the FRONT in their original order
    /// (the C8B budget retains a tick's unprocessed tail without reordering).
    pub(crate) fn refill_front<I: IntoIterator<Item = String>>(&mut self, lines: I) {
        for line in lines.into_iter().collect::<Vec<_>>().into_iter().rev() {
            self.pending.push_front(line);
        }
    }
}

/// True only on the tick where the pending queue crosses the high-water
/// mark upward, so the warning fires once per crossing instead of every
/// tick spent above it.
pub(crate) fn crossed_high_water(before: usize, after: usize) -> bool {
    before <= SVC_PENDING_HIGH_WATER && after > SVC_PENDING_HIGH_WATER
}

/// How many decode-triggering (expensive) commands one guest frame may run.
/// The C8A mechanism gate (docs/history/decode-pressure-research-1/
/// EVIDENCE.md) measured a 64-command burst serializing 1.57s of decodes
/// into one turn with a 2.48GB superseded-residency peak; one expensive
/// command per tick bounds the guest-frame delay at one decode and the
/// superseded residency at one handle per observation boundary, while the
/// retained FIFO (this module) preserves order and loses nothing.
#[allow(dead_code)]
pub(crate) const MAX_SVC_EXPENSIVE_COMMANDS_PER_TICK: usize = 1;

/// Split one drained batch by the per-tick expensive-command budget
/// (C8B): process cheap lines and at most
/// `MAX_SVC_EXPENSIVE_COMMANDS_PER_TICK` expensive commands now; retain
/// the rest in FIFO order for later ticks. `is_expensive` classifies a raw
/// svc line. Cheap lines are never starved behind an earlier tick's
/// expensive boundary: they flow through on the next tick's split before
/// the next expensive command.
pub(crate) fn split_expensive_budget(
    batch: impl IntoIterator<Item = String>,
    is_expensive: impl Fn(&str) -> bool,
) -> (Vec<String>, Vec<String>) {
    let mut process_now = Vec::new();
    let mut retain = Vec::new();
    let mut budget_used = false;
    for line in batch {
        if !budget_used && is_expensive(&line) {
            budget_used = true;
            process_now.push(line);
        } else if budget_used {
            retain.push(line);
        } else {
            process_now.push(line);
        }
    }
    (process_now, retain)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn lines(count: usize) -> Vec<String> {
        (0..count).map(|i| format!("{{\"n\":{i}}}")).collect()
    }

    #[test]
    fn empty_refill_processes_nothing() {
        let mut q = SvcPending::new();
        q.refill(Vec::<String>::new());
        assert!(q.take_batch(MAX_SVC_LINES_PER_TICK).is_empty());
    }

    #[test]
    fn single_line_processed_in_first_batch() {
        let mut q = SvcPending::new();
        q.refill(lines(1));
        let batch = q.take_batch(MAX_SVC_LINES_PER_TICK);
        assert_eq!(batch.len(), 1);
        assert_eq!(batch[0], "{\"n\":0}");
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn budget_sized_batch_is_fully_processed() {
        let mut q = SvcPending::new();
        q.refill(lines(MAX_SVC_LINES_PER_TICK));
        let batch = q.take_batch(MAX_SVC_LINES_PER_TICK);
        assert_eq!(batch.len(), MAX_SVC_LINES_PER_TICK);
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn one_line_over_budget_waits_for_next_batch() {
        let mut q = SvcPending::new();
        q.refill(lines(MAX_SVC_LINES_PER_TICK + 1));
        let first = q.take_batch(MAX_SVC_LINES_PER_TICK);
        assert_eq!(first.len(), MAX_SVC_LINES_PER_TICK);
        assert_eq!(first[0], "{\"n\":0}");
        assert_eq!(first[MAX_SVC_LINES_PER_TICK - 1], "{\"n\":63}");
        let second = q.take_batch(MAX_SVC_LINES_PER_TICK);
        assert_eq!(second.len(), 1);
        assert_eq!(second[0], "{\"n\":64}");
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn three_tick_drain_retains_all_129_lines_in_order() {
        let mut q = SvcPending::new();
        q.refill(lines(129));
        let mut seen: Vec<String> = Vec::new();
        seen.extend(q.take_batch(MAX_SVC_LINES_PER_TICK));
        assert_eq!(seen.len(), 64);
        seen.extend(q.take_batch(MAX_SVC_LINES_PER_TICK));
        assert_eq!(seen.len(), 128);
        seen.extend(q.take_batch(MAX_SVC_LINES_PER_TICK));
        assert_eq!(seen.len(), 129);
        // FIFO preserved, nothing duplicated, nothing lost.
        for (i, line) in seen.iter().enumerate() {
            assert_eq!(*line, format!("{{\"n\":{i}}}"));
        }
        assert_eq!(seen.iter().collect::<std::collections::HashSet<_>>().len(), 129);
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn later_refill_queues_behind_earlier_tail() {
        let mut q = SvcPending::new();
        q.refill(lines(3));
        let first_two = q.take_batch(2);
        assert_eq!(first_two.len(), 2);
        // A new tick's drain arrives while line 2 is still pending.
        q.refill(lines(2).into_iter().map(|l| l + "-late"));
        let rest = q.take_batch(MAX_SVC_LINES_PER_TICK);
        let joined: Vec<String> = rest.into_iter().collect();
        assert_eq!(joined, vec!["{\"n\":2}", "{\"n\":0}-late", "{\"n\":1}-late"]);
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn budget_over_pending_takes_everything() {
        let mut q = SvcPending::new();
        q.refill(lines(5));
        let batch = q.take_batch(MAX_SVC_LINES_PER_TICK);
        assert_eq!(batch.len(), 5);
        assert_eq!(q.len(), 0);
    }

    #[test]
    fn zero_budget_takes_nothing() {
        let mut q = SvcPending::new();
        q.refill(lines(5));
        assert!(q.take_batch(0).is_empty());
        assert_eq!(q.len(), 5);
    }

    #[test]
    fn high_water_crossing_fires_once_per_crossing() {
        assert!(!crossed_high_water(0, 10));
        assert!(!crossed_high_water(SVC_PENDING_HIGH_WATER, SVC_PENDING_HIGH_WATER));
        assert!(crossed_high_water(
            SVC_PENDING_HIGH_WATER,
            SVC_PENDING_HIGH_WATER + 1
        ));
        assert!(!crossed_high_water(
            SVC_PENDING_HIGH_WATER + 1,
            SVC_PENDING_HIGH_WATER + 2
        ));
        assert!(!crossed_high_water(
            SVC_PENDING_HIGH_WATER + 2,
            SVC_PENDING_HIGH_WATER
        ));
    }

    // --- C8B decode-pressure budget ---------------------------------------

    fn is_expensive(line: &str) -> bool {
        line.contains("\"cmd\":\"next\"")
    }

    #[test]
    fn budget_splits_one_expensive_from_a_burst() {
        let batch: Vec<String> = (0..64)
            .map(|_| "{\"t\":\"pv\",\"cmd\":\"next\"}".to_string())
            .collect();
        let (now, retain) = split_expensive_budget(batch, is_expensive);
        assert_eq!(now.len(), MAX_SVC_EXPENSIVE_COMMANDS_PER_TICK);
        assert_eq!(now[0], "{\"t\":\"pv\",\"cmd\":\"next\"}");
        assert_eq!(retain.len(), 63);
        // FIFO retained: the tail keeps its arrival order.
        assert!(retain.windows(2).all(|w| w[0] <= w[1]));
    }

    #[test]
    fn cheap_lines_flow_through_the_budget() {
        let batch = vec![
            "{\"t\":\"pv\",\"cmd\":\"pick-file\"}".to_string(),
            "{\"t\":\"pv\",\"cmd\":\"next\"}".to_string(),
            "not json".to_string(),
            "{\"t\":\"pv\",\"cmd\":\"pick-file\"}".to_string(),
        ];
        let (now, retain) = split_expensive_budget(batch, is_expensive);
        // Cheap lines before the expensive one are processed with it; cheap
        // lines after the budget boundary wait with the tail (strict FIFO,
        // no reordering).
        assert_eq!(now.len(), 2);
        assert!(now[0].contains("pick-file"));
        assert_eq!(retain.len(), 2);
        assert_eq!(retain[0], "not json");
    }

    #[test]
    fn all_cheap_batch_never_triggers_the_budget() {
        let batch = vec!["a".to_string(), "b".to_string(), "c".to_string()];
        let (now, retain) = split_expensive_budget(batch, is_expensive);
        assert_eq!(now.len(), 3);
        assert!(retain.is_empty());
    }

    #[test]
    fn retained_tail_restores_front_order() {
        let mut q = SvcPending::new();
        q.refill(lines(3));
        let _ = q.take_batch(1); // line 0 processed; 1..3 pending
        q.refill_front(vec!["{\"n\":-1}".to_string(), "{\"n\":-2}".to_string()]);
        // Front-restored lines keep their order and sit ahead of the tail.
        let batch = q.take_batch(MAX_SVC_LINES_PER_TICK);
        let joined: Vec<String> = batch.into_iter().collect();
        assert_eq!(
            joined,
            vec!["{\"n\":-1}", "{\"n\":-2}", "{\"n\":1}", "{\"n\":2}"]
        );
    }

    #[test]
    fn sixty_five_line_burst_under_the_decode_budget_settles_in_order() {
        // Full-loop oracle: refill → batch → budget split → retain front,
        // repeated until the queue drains. 65 expensive commands settle in
        // 65 ticks, one per tick, none lost, none duplicated, order kept.
        let mut q = SvcPending::new();
        q.refill(
            (0..65).map(|i| format!("{{\"t\":\"pv\",\"cmd\":\"next\",\"i\":{i}}}")),
        );
        let mut processed = Vec::new();
        loop {
            let batch = q.take_batch(MAX_SVC_LINES_PER_TICK);
            if batch.is_empty() {
                break;
            }
            let (now, retain) = split_expensive_budget(batch, is_expensive);
            processed.extend(now);
            q.refill_front(retain);
        }
        assert_eq!(processed.len(), 65);
        for (i, line) in processed.iter().enumerate() {
            assert!(*line == format!("{{\"t\":\"pv\",\"cmd\":\"next\",\"i\":{i}}}"));
        }
    }
}
