# Frozen companion references

These are the two standalone Home Assistant companion resources whose **behavior has been
absorbed** into the tested codebase (`src/companion/`) through **v0.1.136**. They are kept here
as **frozen reference artifacts only** — they are no longer part of the distributed module, and
they are byte-frozen forever (never edited; the byte-identity / parity tests read them from this
path as the source of truth).

| File | SHA256 | Absorbed into |
|---|---|---|
| `nostrodomus_editor_v17_2_learned_reapply.js` | `10efb39b7320b568cb6a2b9ee724d7d8b96027038bdce41e8afc5b89d59f7903` | coordinator (P1), scrollbar styling (P2), codebox-enlarge learned memory (P3), typing-quiet (P4), the v17 settle/persistence engine (v0.1.133), no-wrap codebox (v0.1.136) |
| `nostrodomus-picker-safe.js` | `2a766f57cf6b036de0005676c14b4d3bb95f03a9d9b4c83ad4475a7b2ed67158` | coordinator (P1), typing-quiet/quiet-window (P4), picker visual-fix re-seam (P5, currently DORMANT) |

**For existing users:** see `docs/COMPANION_RESOURCES.md` — the absorbed module now carries this
behavior, so the two legacy Lovelace resources can be removed.

**Do not modify these files.** They moved here from `companion_www/` at the ABSORB closeout
(CHECKPOINT E); the bytes are unchanged.
