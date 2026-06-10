# Prefer Model Clarity Over Compatibility Before 1.0

Before 1.0, Viz Engine may break public import paths, option names, frame fields, and deprecated aliases when doing so makes the data/frame engine model clearer. This prevents compatibility promises from preserving misleading concepts such as compact-frame terminology or React-heavy root exports.

The stable direction is the domain model, not every pre-1.0 surface. Migration docs should explain replacement paths, but they should not promise indefinite support for names that conflict with the model.
