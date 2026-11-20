Here is the consolidated, corrected Markdown specification. It combines the original requirements, subsequent suggestions, technical considerations, educational features, design decisions, and development priorities into one document.

You can copy the entire specification directly into your coding agent.

Writing

# Music Theory Chord Visualizer — Complete Project Specification

## 1. Project Overview

Build a modern, browser-based music composition and music theory analysis application.

The application's primary purpose is to help users understand harmony, discover appropriate chords and scales, experiment with musical ideas, and learn music theory through their own compositions.

It should combine:

- A functional MIDI piano roll.
- Real-time harmonic analysis.
- Chord and scale recommendation engines.
- Chord progression analysis.
- Voice-leading analysis.
- Interactive music theory visualizations.
- Contextual educational explanations.
- Built-in audio playback.

The application should be **analysis-first**, with a capable built-in MIDI editor.

It should serve both complete beginners and advanced musicians.

### Core philosophy

The application should analyze the music the user actually creates, rather than forcing it into predefined scales or conventional harmony.

It should explain:

- What musical possibilities exist.
- How well they fit the existing composition.
- Why certain chords and scales work.
- What makes alternative choices interesting.
- How different choices affect the musical character.

The application should encourage experimentation rather than enforce theoretical rules.

---

# 2. Design Principles

1. Prioritize analytical accuracy over feature quantity.
2. Never automatically treat notes outside a scale or chord as mistakes.
3. Account for musical context, not just collections of pitches.
4. Distinguish detected harmony from user-selected harmony.
5. Explain recommendations and scoring transparently.
6. Communicate uncertainty when multiple interpretations are plausible.
7. Keep educational information readily accessible.
8. Avoid excessive hidden features, nested menus, and complicated navigation.
9. Maintain a simple, readable interface despite advanced functionality.
10. Update analysis automatically as the composition changes.

Advanced musical information should be visible without requiring users to navigate through separate advanced settings.

Beginners should see understandable descriptions, while advanced musicians should also have access to terminology such as Roman numerals, harmonic function, inversions, intervals, and voice leading.

---

# 3. Piano Roll Editor

Build an intermediate DAW-style MIDI piano roll.

The piano roll is the central workspace and should feel like a proper music production editor rather than a simplified chord-input interface.

## Editing functionality

Support:

- Drawing and placing notes.
- Selecting individual notes.
- Multi-selecting notes.
- Moving notes.
- Resizing note durations.
- Deleting notes.
- Copying and pasting notes.
- Duplicating notes and patterns.
- Configurable rhythmic snapping.
- Velocity editing.
- Horizontal and vertical scrolling.
- Zooming.
- Undo and redo.
- Keyboard shortcuts.
- Standard mouse and keyboard editing conventions inspired by LMMS and REAPER.

Allow the user to work with any combination of musical material, including melodies, bass lines, chords, and complete compositions.

## MIDI interoperability

Implement:

- Standard MIDI file import.
- Standard MIDI file export.
- MIDI drag and drop.
- Preservation of note positions, durations, velocities, tracks, and tempo where applicable.
- Internal copy/paste functionality.
- External MIDI clipboard interoperability where technically possible.
- MIDI file import/export as a fallback for DAWs that do not support compatible clipboard formats.

Test interoperability with LMMS and REAPER.

Do not promise universal external clipboard compatibility without testing the actual DAW formats.

## Chord sections and timeline

Above the piano roll, implement an interactive timeline where users can create chord-analysis sections.

Support:

- Clicking to create section boundaries.
- Dragging boundaries.
- Resizing sections.
- Splitting sections.
- Merging sections.
- Multiple sections within one bar.
- Sections spanning multiple bars.
- Automatic section boundary suggestions based on harmonic changes.
- Manual overrides of automatic boundaries.

A section is an analytical region, not necessarily a claim that the harmony changes at that exact point.

Users must remain in control of section boundaries.

---

# 4. Playback and Audio Engine

Implement a lightweight built-in audio engine.

Required functionality:

- Play, pause, and stop.
- Visible playhead.
- Adjustable tempo.
- Time signature support.
- Loop playback.
- Loop selected sections.
- Metronome.
- Velocity and volume controls.
- Basic instrument selection.

Start with a triangle-wave synthesizer or simple piano-like synthesized sound using Web Audio.

Prioritize reliable playback and accurate timing.

Native VST hosting is not required for the browser version. It may be considered for a future desktop version.

---

# 5. Harmonic Analysis Engine

This is the application's highest-priority subsystem.

The analysis engine must continuously evaluate the musical content and rank possible harmonic interpretations.

Analysis should work at both global and individual section levels.

## 5.1 Global analysis

Analyze the entire composition to identify:

- Possible keys.
- Possible scales.
- Relative major/minor relationships.
- Modal possibilities.
- Potential key changes.
- Modulations.
- Temporary tonal centers.
- Sections that emphasize different scales or modes.

Do not assume the entire composition necessarily belongs to one key.

Allow different sections to have different harmonic interpretations.

## 5.2 Section analysis

For each chord section:

- Identify possible chords.
- Rank candidate chords.
- Identify inversions.
- Analyze the bass note.
- Detect ambiguous interpretations.
- Analyze neighboring chords.
- Identify shared notes with neighboring sections.
- Evaluate progression compatibility.

## 5.3 Note analysis

Account for:

- Pitch class.
- Octave.
- Note duration.
- Velocity.
- Beat position.
- Rhythmic strength.
- Repetition.
- Sustained notes.
- Bass notes.
- Melodic and accompaniment roles where identifiable.

Not all notes should have equal influence.

For example, a short passing note on a weak beat should generally have less influence than a sustained note on a strong beat.

## 5.4 Scoring dimensions

Evaluate candidates using multiple dimensions:

| Dimension | Purpose |
| --- | --- |
| Note compatibility | How well pitches fit the candidate |
| Bass compatibility | Whether the bass supports the interpretation |
| Chord compatibility | How well existing harmonies fit |
| Rhythmic importance | Whether conflicting notes are structurally important |
| Note duration | Account for sustained versus brief notes |
| Harmonic function | Evaluate the candidate's musical role |
| Progression compatibility | Evaluate neighboring chords |
| Voice leading | Measure smoothness of transitions |
| Stylistic compatibility | Account for an optional musical style |

The scoring system should be transparent and explainable.

Display:

- Overall compatibility.
- Number of notes outside the candidate.
- Identity of outside notes.
- Weighted compatibility.
- Individual scoring dimensions.
- Reasons for positive and negative assessments.

Allow users to adjust the importance of scoring dimensions.

Different analysis profiles could prioritize different musical characteristics, such as conventional pop harmony, jazz harmony, or more experimental music.

Avoid presenting arbitrary percentages as objective musical truths.

The system should distinguish between:

- Pitch compatibility.
- Harmonic plausibility.
- Contextual appropriateness.
- Stylistic suitability.

## 5.5 Ambiguity and uncertainty

The engine must acknowledge that multiple interpretations can be musically valid.

For example, the same notes might represent different chords depending on the bass note, musical context, and note emphasis.

Display competing interpretations when appropriate.

Do not confidently claim that one interpretation is definitively correct when the evidence supports several possibilities.

---

# 6. Music Theory Knowledge

The application should support a broad range of music theory concepts.

## 6.1 Scales and keys

Include:

- Major scale.
- Natural minor.
- Harmonic minor.
- Melodic minor.
- Major and minor pentatonic.
- Blues scales.
- Church modes.
- Other commonly used scales.
- Relative major/minor.
- Parallel major/minor.
- Modulation.
- Modal interchange.

## 6.2 Chords

Include:

- Major triads.
- Minor triads.
- Diminished chords.
- Augmented chords.
- Suspended chords.
- Seventh chords.
- Extended chords (9ths, 11ths, 13ths).
- Added-tone chords.
- Altered chords.
- Slash chords.
- Chord inversions.
- Borrowed chords.
- Secondary dominants.
- Diminished passing chords.

Support different chord voicings and arrangements of the same harmonic structure.

## 6.3 Intervals

An interval is the distance between two notes.

Include an interactive interval inspector.

For selected notes, display:

- Interval name.
- Semitone distance.
- Direction.
- Consonance/dissonance characteristics.
- Role within a chord.
- Audio example.

Examples:

- C to E: major third.
- C to Eb: minor third.
- C to G: perfect fifth.
- C to B: major seventh.

Explain how intervals combine to form chords and scales.

## 6.4 Harmonic function

Support:

- Tonic.
- Predominant.
- Subdominant.
- Dominant.
- Roman numeral notation.
- Scale degrees.
- Harmonic tension.
- Resolution.
- Cadences.

Explain the role of chords within a key.

For example, in C major:

| Chord | Roman numeral | Function |
| --- | --- | --- |
| C | I | Tonic |
| Dm | ii | Predominant |
| Em | iii | Tonic-family |
| F | IV | Predominant |
| G | V | Dominant |
| Am | vi | Tonic-family |
| Bdim | vii° | Dominant-family |

These classifications should be explained as useful theoretical models, not absolute rules.

## 6.5 Chromatic harmony

Support explanations of:

- Borrowed chords.
- Modal mixture.
- Secondary dominants.
- Chromatic passing chords.
- Diminished passing chords.
- Suspensions.
- Modulation.
- Non-diatonic chords.
- Altered harmony.

A chord outside the current scale should not automatically receive a negative assessment.

For example, F minor in C major introduces Ab, but can produce a beautiful borrowed-chord effect.

Explain why such choices can work.

---

# 7. Chord Progression Analysis

Analyze chords in their musical context, not just individually.

Implement:

- Chord-to-chord compatibility.
- Common progression detection.
- Ranking of possible next chords.
- Harmonic function relationships.
- Tension and resolution analysis.
- Cadence detection.
- Shared-note analysis.
- Voice-leading smoothness.
- Alternative progression suggestions.

Include common progressions as educational examples:

| Progression | General character |
| --- | --- |
| I – V – vi – IV | Familiar, uplifting, emotional |
| I – vi – IV – V | Classic, nostalgic |
| ii – V – I | Strong resolution, jazz |
| vi – IV – I – V | Reflective, contemporary |
| i – VI – III – VII | Cinematic, minor |

These should be treated as examples, not fixed rules.

## Chord relationship map

Implement an interactive visual map showing:

- Closely related chords.
- Chords sharing notes.
- Common next chords.
- Dominant and subdominant relationships.
- Relative major/minor relationships.
- Borrowed chords.
- More adventurous harmonic alternatives.

Selecting a chord should show its relationships and allow users to hear transitions.

---

# 8. Voice Leading

Voice leading describes how individual notes move between chords.

This should be a major analysis feature.

Implement:

- Visual connections between notes in consecutive chords.
- Note-to-note movement analysis.
- Voice-leading smoothness scoring.
- Common-tone identification.
- Alternative chord inversions.
- Large-jump detection.
- Suggestions for smoother transitions.

For example, moving from C major to F major:

- C → C: unchanged.
- E → F: one semitone.
- G → A: two semitones.

Explain why certain transitions feel smoother than others.

Allow users to compare different inversions and voicings.

---

# 9. Chord and Scale Explorers

Provide dedicated, immediately accessible chord and scale exploration panels.

## Scale explorer

For every candidate scale, display:

- Name.
- Constituent notes.
- Intervals.
- Compatibility score.
- Number of outside notes.
- Characteristic notes.
- Related scales.
- Related modes.
- Relationship to the current composition.

Allow users to select a scale and highlight its notes on the piano roll.

## Chord explorer

For every candidate chord, display:

- Chord name.
- Constituent notes.
- Intervals.
- Bass note.
- Inversion.
- Harmonic function.
- Compatibility score.
- Outside notes.
- Shared notes with neighboring chords.
- Progression compatibility.
- Typical moods.
- Common genres and musical contexts.
- Explanation of why it might work.
- Alternative voicings.

Allow users to:

1. Select a chord.
2. Hear it.
3. View its notes on the piano roll.
4. Explore inversions.
5. Explore extensions.
6. Insert it into the composition.
7. Compare it against the original.
8. Undo the experiment.

---

# 10. Interactive Musical Visualizations

Include the following established music theory representations.

| Visualization | Educational purpose |
| --- | --- |
| Circle of fifths | Key relationships and modulation |
| Keyboard diagrams | Understanding note positions |
| Scale degree charts | Understanding the role of notes |
| Interval diagrams | Understanding distances between notes |
| Chord construction diagrams | Understanding chord composition |
| Chord relationship maps | Understanding harmonic relationships |
| Roman numeral charts | Understanding chord function |
| Voice-leading diagrams | Understanding note movement |
| Cadence diagrams | Understanding resolution |
| Progression maps | Understanding harmonic sequences |

All visualizations should be interactive where practical.

Clicking a musical element should display an explanation and allow playback.

## Piano roll guides

When a chord or scale is selected:

- Highlight its notes faintly on the piano roll.
- Distinguish scale guides from chord guides.
- Show existing notes separately.
- Identify notes outside the current interpretation.
- Never restrict note placement.

These guides should help users experiment without enforcing rules.

---

# 11. Educational Content

Educational explanations are a core feature, not an optional help section.

Every chord and scale suggestion should have contextual information.

Display:

- What it is.
- Its constituent notes.
- How it is constructed.
- Its intervals.
- Its harmonic function.
- Why it fits the current composition.
- Why it might not fit.
- Its musical character and mood.
- Common genres and contexts of use.
- Typical progressions.
- Alternative choices.
- Practical experimentation tips.

The explanations should be contextual.

For example, instead of merely defining F minor, explain why F minor could work in the user's current C major composition, what it changes harmonically, and what emotional effect it might produce.

## Educational presentation

- Keep important information visible immediately.
- Avoid excessive tabs and nested menus.
- Present beginner-friendly explanations alongside advanced terminology.
- Show Roman numerals and harmonic functions where applicable.
- Use concise explanations and clear labels.
- Prefer contextual explanations over generic textbook definitions.
- Avoid overwhelming users through careful grouping and visual hierarchy.

Advanced concepts should be accessible without requiring the user to activate a separate advanced mode.

---

# 12. Real-Time Analysis

The analysis engine must respond automatically to composition changes.

Relevant actions include:

- Adding notes.
- Deleting notes.
- Moving notes.
- Resizing notes.
- Changing velocity.
- Changing section boundaries.
- Adding or removing sections.

Update:

- Global scale rankings.
- Global key interpretations.
- Section chord rankings.
- Harmonic relationships.
- Progression analysis.
- Piano roll guides.
- Compatibility indicators.
- Educational explanations.

Use incremental analysis where practical to avoid unnecessary recomputation.

Keep automatically detected harmony separate from user-selected harmony.

Users should be able to explore theoretical interpretations without permanently changing the composition.

---

# 13. User Interface and Visual Design

## Appearance

Create a modern, friendly, minimalist dark interface.

Use:

- Dark backgrounds.
- Colorful but restrained accents.
- Clear typography.
- Strong visual hierarchy.
- Consistent spacing.
- Readable information density.
- Subtle highlighting.
- Minimal decorative clutter.

## Color semantics

Colors should have consistent musical meanings.

For example:

- Similar chord families should share colors.
- Harmonic functions should have recognizable colors.
- Existing notes, suggested notes, and selected notes should be distinguishable.
- Outside notes should be identifiable without appearing as errors.

Never rely on color alone to communicate information.

## Workspace layout

The piano roll should remain the main workspace.

Organize the surrounding information into clearly visible areas:

1. **Composition overview:** Key, scale, tempo, time signature, and overall analysis.
2. **Chord explorer:** Ranked chord candidates for the selected section.
3. **Scale explorer:** Ranked scales for the composition and selected sections.
4. **Progression explorer:** Chord relationships, transitions, and suggestions.
5. **Theory inspector:** Explanations of selected notes, intervals, chords, and scales.

The interface should show substantial educational information without requiring constant navigation.

---

# 14. Technical Architecture

## Platform

Start with a browser-based application.

This allows easy experimentation and provides access to browser audio capabilities and standard MIDI file handling.

A desktop wrapper can be considered later.

## Architecture

Keep the following subsystems independent:

1. Piano roll/editor engine.
2. Audio playback engine.
3. MIDI import/export subsystem.
4. Music theory database.
5. Harmonic analysis engine.
6. Chord and scale recommendation engine.
7. Progression analysis engine.
8. Voice-leading analysis engine.
9. Educational content system.
10. Visualization and UI layer.

The harmonic analysis engine should be independent of the UI so its algorithms can improve without rewriting the editor.

## Internal music representation

Use a consistent representation containing:

- MIDI pitch.
- Note onset.
- Note duration.
- Velocity.
- Track.
- Tempo.
- Time signature.
- Section boundaries.

Ensure that all analysis features use a consistent underlying musical representation.

Prefer established music theory, MIDI, and audio libraries where appropriate rather than implementing everything from scratch.

## Future extensibility

Keep the architecture open to:

- Audio file analysis.
- Audio-to-MIDI transcription.
- External MIDI devices.
- More advanced synthesizers.
- Additional musical styles.
- Desktop packaging.
- Deeper DAW integration.
- Native VST hosting.

These are not initial requirements.

---

# 15. Development Milestones

## Milestone 1 — Musical Foundation

Build a genuinely functional application with:

- Working piano roll.
- Note drawing.
- Selection and multi-selection.
- Moving and resizing notes.
- Deletion.
- Copy/paste.
- Undo and redo.
- Playback and playhead.
- Tempo control.
- Basic synthesizer.
- Editable chord sections.
- Real-time note analysis.
- Interval analysis.
- Global key and scale rankings.
- Section-level chord rankings.
- Outside-note identification.
- Piano roll chord/scale highlighting.
- Contextual educational explanations.

This milestone should establish a reliable and extensible foundation.

## Milestone 2 — Deeper Harmonic Intelligence

Add:

- Chord progression analysis.
- Harmonic function.
- Roman numeral analysis.
- Voice-leading analysis.
- Chord inversions.
- Alternative voicings.
- Modal interchange.
- Borrowed chords.
- Secondary dominants.
- Circle of fifths.
- Interactive chord relationship maps.
- More sophisticated scoring.
- Configurable analysis weights.

## Milestone 3 — Complete Learning Workstation

Add:

- MIDI import/export.
- LMMS and REAPER interoperability testing.
- Improved synthesizer.
- Additional instrument options.
- Advanced musical style analysis.
- Comprehensive interactive theory reference.
- Expanded educational content.
- More advanced experimentation tools.
- Potential audio analysis.
- Potential desktop application.

---

# 16. Explicit Non-Goals for the First Version

Do not prioritize:

- Full DAW functionality.
- Recording and mixing.
- Native VST hosting.
- Full audio-to-MIDI transcription.
- Complex audio effects.
- Universal clipboard compatibility with every DAW.

Focus on composition, harmonic analysis, education, and reliable MIDI editing.

---

# 17. Testing and Quality Requirements

The application should be tested with both synthetic examples and real musical compositions.

Create tests for:

- Note and interval identification.
- Major and minor scale detection.
- Modal scale detection.
- Chord identification.
- Chord inversions.
- Bass-note interpretation.
- Outside-note counting.
- Weighted note compatibility.
- Chord progression relationships.
- Harmonic function.
- Voice-leading calculations.
- Modulation detection.
- Ambiguous harmonic interpretations.
- MIDI import/export.
- Playback timing.
- Piano roll editing operations.

Test compositions containing:

- Conventional diatonic harmony.
- Chromatic passing notes.
- Borrowed chords.
- Modal music.
- Modulations.
- Melodies with non-chord tones.
- Extended chords.
- Ambiguous chord voicings.

Do not optimize the analysis solely for simple major-key examples.

---

# 18. Initial Acceptance Criteria

The first usable version must allow a user to:

1. Open the application and start composing immediately.
2. Draw and edit MIDI notes.
3. Select, move, resize, copy, paste, and delete notes.
4. Hear the composition.
5. Create and adjust chord sections.
6. See possible keys and scales ranked automatically.
7. See possible chords ranked for each section.
8. Understand which notes support or conflict with each candidate.
9. See the number and identity of outside notes.
10. See relevant scale and chord notes highlighted on the piano roll.
11. Select a chord and understand why it might work.
12. Experiment with alternative chords and hear the result.
13. See analysis update automatically after editing.

All core functionality must be real and operational, not merely represented by static interface elements.

---

# 19. Instructions to the Coding Agent

Follow these development principles:

1. Implement one milestone at a time.
2. Establish the project architecture before implementing large feature sets.
3. Prioritize a working end-to-end application over static mockups.
4. Use genuine music theory calculations rather than hardcoded example results.
5. Keep the harmonic analysis engine independent of the UI.
6. Write automated tests for important musical calculations.
7. Use established libraries where appropriate.
8. Keep the interface readable and information-rich.
9. Do not hide important educational information behind excessive navigation.
10. Do not claim functionality is implemented until it actually works.
11. Clearly document incomplete functionality and technical limitations.
12. Avoid premature complexity and unnecessary dependencies.

Before starting implementation, produce a proposed technical architecture, technology stack, and milestone breakdown. Then begin building the first functional milestone.

---

# 20. Overall Product Vision

Build an intelligent music theory and composition workstation that helps users understand, explore, and improve their music.

The defining feature should be its ability to explain musical possibilities in context.

It should not merely identify which notes belong to a scale or which chords are present.

It should explain:

- Why different harmonic interpretations are possible.
- Why particular chords work in a composition.
- How chords relate to each other.
- How individual notes move between chords.
- What alternatives are available.
- What musical effect those alternatives might produce.

**The central goal is to make advanced harmonic understanding accessible through direct musical experimentation, without sacrificing analytical depth or musical accuracy.**