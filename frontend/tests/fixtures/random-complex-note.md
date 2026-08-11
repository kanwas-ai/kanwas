# Expedition Notes

The field team reached the ridge just before sunrise and found the old weather station still humming. Most of the equipment was intact, but the logs were scattered across three notebooks, one cracked tablet, and a laminated checklist hanging from the west wall.

## Snapshot

- Location: North ridge relay station
- Weather: Cold wind, clear visibility, unstable afternoon clouds
- Primary goal: Catalog the station contents before transport
- Secondary goal: Document anything that looks custom, improvised, or dangerous

## Immediate Actions

1. Photograph the exterior from all four sides.
2. Tag removable equipment with temporary labels.
3. Verify whether the backup battery cabinet is still energized.
4. Copy the handwritten calibration notes into the central report.

## Inventory Table

| Item             | Condition | Last Known Use      | Notes                                        |
| ---------------- | --------- | ------------------- | -------------------------------------------- |
| Anemometer array | Fair      | Winter survey       | Spins freely but reports intermittent spikes |
| Battery cabinet  | Unknown   | Emergency reserve   | Outer casing warm to the touch               |
| Signal repeater  | Good      | Daily sync          | Firmware sticker suggests a custom build     |
| Tool crate       | Rough     | General maintenance | Missing torque wrench and sealant gun        |

## Observations

The interior layout is more organized than expected. Someone clearly maintained the station long after the original installation date, and they did it with a mix of proper parts and improvised repairs. The strange part is that the handwritten notes are much newer than the official maintenance labels.

### Unresolved Questions

- Why was the repeater firmware rebuilt locally?
- Who replaced the west-facing sensor cable with marine-grade wiring?
- Why does the checklist mention a shutdown drill that is not present in the digital logs?

### Working Theory

> The station may have been quietly repurposed as a temporary relay point during a communications outage, then only partially restored to its documented configuration.

## Technical Fragments

```text
relay.mode=burst
sync.window=04:30-04:45
battery.failover=manual
notes="Do not cycle cabinet B until line is dry"
```

## Follow-up

If transport is approved, move the repeater and notebooks first, then isolate the battery cabinet for a controlled inspection. If transport is denied, leave the station powered but reduce transmission frequency until a second team can review the modifications.
