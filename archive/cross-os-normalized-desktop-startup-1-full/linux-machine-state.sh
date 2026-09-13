#!/bin/bash
# CROSS-OS-NORMALIZED-DESKTOP-STARTUP-1 — Linux machine-state + 30 s ambient
# observation. Run BEFORE every headline batch on the Linux host.
echo "=== OS ==="
head -2 /etc/os-release
echo "kernel: $(uname -r)"
echo "=== CPU ==="
lscpu | grep -E "Model name|^CPU\(s\)|Vendor ID" 
echo "=== MEM (MiB) ==="
free -m | head -2
echo "=== GPU / Vulkan ==="
lspci | grep -iE "vga|3d"
vulkaninfo --summary 2>/dev/null | grep -E "GPU0|deviceName|driverName|driverInfo|apiVersion" | head -8
echo "=== DISPLAY ==="
echo "WAYLAND_DISPLAY=wayland-0 (pinned by runner)"
loginctl list-sessions --no-legend 2>/dev/null | head -5
ps -e | grep -iE "kwin_wayland|plasmashell" | head -3
kscreen-doctor -o 2>/dev/null | grep -iE "geometry|mode|scale" | head -6
echo "=== POWER ==="
upower -i $(upower -e | grep -i BAT | head -1) 2>/dev/null | grep -E "state|percentage" || echo "no battery (AC desktop)"
cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor 2>/dev/null
echo "=== UPTIME / LOAD ==="
uptime
echo "=== BACKGROUND ACTIVITY ==="
echo "cargo/rustc procs: $(pgrep -c -x cargo || echo 0) $(pgrep -c -x rustc || echo 0)"
echo "dnf procs: $(pgrep -c dnf || echo 0)"
echo "=== AMBIENT CPU 30s (1s samples) ==="
for i in $(seq 1 30); do
    top -bn1 | grep "Cpu(s)" | sed 's/.*, *\([0-9.]*\)%* id.*/\1/' | awk '{print 100 - $1}'
    sleep 1
done
echo "=== AMBIENT-END ==="
