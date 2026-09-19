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

/// Diagnostic high-water mark for the pending queue. Crossing it never
/// drops anything; it only surfaces sustained queue growth in logs.
/// True backpressure against a producer that outruns the budget is a
/// decode-scheduling question, tracked separately from this retention fix.
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

    pub(crate) fn is_empty(&self) -> bool {
        self.pending.is_empty()
    }
}

/// True only on the tick where the pending queue crosses the high-water
/// mark upward, so the warning fires once per crossing instead of every
/// tick spent above it.
pub(crate) fn crossed_high_water(before: usize, after: usize) -> bool {
    before <= SVC_PENDING_HIGH_WATER && after > SVC_PENDING_HIGH_WATER
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
        assert!(q.is_empty());
    }

    #[test]
    fn budget_sized_batch_is_fully_processed() {
        let mut q = SvcPending::new();
        q.refill(lines(MAX_SVC_LINES_PER_TICK));
        let batch = q.take_batch(MAX_SVC_LINES_PER_TICK);
        assert_eq!(batch.len(), MAX_SVC_LINES_PER_TICK);
        assert!(q.is_empty());
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
        assert!(q.is_empty());
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
        assert!(q.is_empty());
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
        assert!(q.is_empty());
    }

    #[test]
    fn budget_over_pending_takes_everything() {
        let mut q = SvcPending::new();
        q.refill(lines(5));
        let batch = q.take_batch(MAX_SVC_LINES_PER_TICK);
        assert_eq!(batch.len(), 5);
        assert!(q.is_empty());
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
}
