// No console on Windows (in release)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    iskpulse_desktop_lib::run()
}
