// Sin consola en Windows (en release)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    eve_ledger_desktop_lib::run()
}
