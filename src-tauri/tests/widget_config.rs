use token_cost_analyzer_lib::widget::{
    clamp_widget_position_to_monitor, merge_widget_config_for_save, normalize_widget_config,
    should_apply_native_widget_config, WidgetConfig, WidgetPosition, WidgetRect,
};

#[test]
fn normalize_widget_config_clamps_window_size_and_refresh_interval() {
    let config = WidgetConfig {
        width: 9999.0,
        height: 10.0,
        refresh_interval_sec: 1,
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.width, WidgetConfig::default().width);
    assert_eq!(normalized.height, WidgetConfig::default().height);
    assert_eq!(normalized.refresh_interval_sec, 5);
}

#[test]
fn normalize_widget_config_removes_unknown_modules() {
    let config = WidgetConfig {
        selected_modules: vec!["top_projects".into(), "unknown".into()],
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.selected_modules, vec!["top_projects".to_string()]);
}

#[test]
fn normalize_widget_config_keeps_a_default_when_all_modules_are_unknown() {
    let config = WidgetConfig {
        selected_modules: vec!["unknown".into()],
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.selected_modules, vec!["overview".to_string()]);
}

#[test]
fn normalize_widget_config_discards_offscreen_position() {
    let config = WidgetConfig {
        x: Some(32767.0),
        y: Some(9504.0),
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.x, None);
    assert_eq!(normalized.y, None);
}

#[test]
fn normalize_widget_config_resets_saved_oversized_widget() {
    let config = WidgetConfig {
        width: 640.0,
        height: 880.0,
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.width, WidgetConfig::default().width);
    assert_eq!(normalized.height, WidgetConfig::default().height);
}

#[test]
fn normalize_widget_config_clamps_glass_opacity_and_mode() {
    let config = WidgetConfig {
        background_mode: "glass".into(),
        background_opacity: 0.2,
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.background_mode, "glass");
    assert_eq!(normalized.background_opacity, 0.25);
}

#[test]
fn normalize_widget_config_resets_unknown_background_mode() {
    let config = WidgetConfig {
        background_mode: "mist".into(),
        background_opacity: f64::NAN,
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.background_mode, WidgetConfig::default().background_mode);
    assert_eq!(normalized.background_opacity, WidgetConfig::default().background_opacity);
}

#[test]
fn merge_widget_config_for_save_preserves_position_by_default() {
    let existing = WidgetConfig {
        x: Some(320.0),
        y: Some(160.0),
        ..WidgetConfig::default()
    };
    let incoming = WidgetConfig {
        selected_modules: vec!["trend".into()],
        x: None,
        y: None,
        ..WidgetConfig::default()
    };

    let merged = merge_widget_config_for_save(incoming, Some(&existing), true);

    assert_eq!(merged.selected_modules, vec!["trend".to_string()]);
    assert_eq!(merged.x, Some(320.0));
    assert_eq!(merged.y, Some(160.0));
}

#[test]
fn merge_widget_config_for_save_can_clear_position_explicitly() {
    let existing = WidgetConfig {
        x: Some(320.0),
        y: Some(160.0),
        ..WidgetConfig::default()
    };
    let incoming = WidgetConfig {
        x: None,
        y: None,
        ..WidgetConfig::default()
    };

    let merged = merge_widget_config_for_save(incoming, Some(&existing), false);

    assert_eq!(merged.x, None);
    assert_eq!(merged.y, None);
}

#[test]
fn clamp_widget_position_to_monitor_keeps_visible_position() {
    let monitor = WidgetRect {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    };

    let position = clamp_widget_position_to_monitor(
        WidgetPosition { x: 984.0, y: -1622.0 },
        320.0,
        440.0,
        monitor,
    );

    assert_eq!(position, WidgetPosition { x: 984.0, y: 20.0 });
}

#[test]
fn clamp_widget_position_to_monitor_keeps_margin_from_bottom_right() {
    let monitor = WidgetRect {
        x: 0.0,
        y: 0.0,
        width: 1920.0,
        height: 1080.0,
    };

    let position = clamp_widget_position_to_monitor(
        WidgetPosition { x: 1900.0, y: 1000.0 },
        320.0,
        440.0,
        monitor,
    );

    assert_eq!(position, WidgetPosition { x: 1580.0, y: 620.0 });
}

#[test]
fn should_apply_native_widget_config_ignores_visual_only_changes() {
    let current = WidgetConfig {
        background_mode: "solid".into(),
        background_opacity: 0.88,
        x: Some(120.0),
        y: Some(140.0),
        ..WidgetConfig::default()
    };
    let next = WidgetConfig {
        background_mode: "glass".into(),
        background_opacity: 0.75,
        x: Some(120.0),
        y: Some(140.0),
        ..WidgetConfig::default()
    };

    assert!(!should_apply_native_widget_config(&current, &next));
}

#[test]
fn should_apply_native_widget_config_detects_size_and_position_changes() {
    let current = WidgetConfig {
        x: Some(120.0),
        y: Some(140.0),
        ..WidgetConfig::default()
    };
    let resized = WidgetConfig {
        width: 360.0,
        x: Some(120.0),
        y: Some(140.0),
        ..WidgetConfig::default()
    };
    let moved = WidgetConfig {
        x: Some(180.0),
        y: Some(140.0),
        ..WidgetConfig::default()
    };

    assert!(should_apply_native_widget_config(&current, &resized));
    assert!(should_apply_native_widget_config(&current, &moved));
}

#[test]
fn should_apply_native_widget_config_detects_resizable_changes() {
    let current = WidgetConfig {
        resizable: false,
        x: Some(120.0),
        y: Some(140.0),
        ..WidgetConfig::default()
    };
    let next = WidgetConfig {
        resizable: true,
        x: Some(120.0),
        y: Some(140.0),
        ..WidgetConfig::default()
    };

    assert!(should_apply_native_widget_config(&current, &next));
}

#[test]
fn normalize_widget_config_accepts_lower_glass_opacity() {
    let config = WidgetConfig {
        background_mode: "glass".into(),
        background_opacity: 0.25,
        ..WidgetConfig::default()
    };

    let normalized = normalize_widget_config(config);

    assert_eq!(normalized.background_opacity, 0.25);
}
