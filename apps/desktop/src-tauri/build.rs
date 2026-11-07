fn main() {
    // Rebuild when the shared sources embedded via include_str! change.
    println!("cargo:rerun-if-changed=../../../docs/05-themes.toml");
    println!("cargo:rerun-if-changed=../../../packages/kit-core/i18n/en.json");
    println!("cargo:rerun-if-changed=../../../packages/kit-core/i18n/tr.json");
    tauri_build::build()
}
