// No console on Windows (in release)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    eve_ledger_desktop_lib::run()
}
