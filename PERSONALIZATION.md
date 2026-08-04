# Local personalization

ReisSlim learns only from explicit local actions: selecting, saving, comparing, applying or dismissing a proposal. Signals are stored by tag, bounded between negative and positive limits and require at least two pieces of evidence before they influence ranking. The maximum ranking adjustment is deliberately small, so hard constraints and explicit form preferences always dominate.

The profile records event type, destination identity, relevant tags and timestamp. It does not upload data, infer sensitive traits, or hide why a learned preference affected a card. Proposal cards can show the matching learned tags.

Private mode prevents all new learning and prevents learned signals from changing scores. Existing local evidence is retained so the user can leave private mode without data loss. The storage contract supports JSON export/import through `preference-engine.js`; a future settings screen can expose those functions without changing the model.

Changing trip context does not rewrite learned evidence. Vehicle, party composition, dates, hard constraints and selected preferences are always taken from the current trip request, not inferred from history.
