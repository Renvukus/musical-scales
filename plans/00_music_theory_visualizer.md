# Music theory chord visualizer
I want help learning chords and musical scales, and applying them to existing compositions.

### Piano roll
Create an editor that includes a fully functional MIDI piano roll, with placeable keys. It supports drawing keys, as well as multi-selecting them, copy-pasting them, deleting them, and everything else according to the mouse & keyboard layout of LMMS. The notes are also copiable outside the editor, and fully support copying from the editor and placing in LMMS / Reaper and vice versa.

The piano roll can include anything (from melody to pre-existing chords).

The bar above the piano roll is clickable to separate it into different chord sections. These can be dragged easily.

The music is playable - there's a playhead. It would be nice if a simple piano sound was used (or perhaps a loadable VST), but if this introduces significant overhead a simple triangle wave is also fine.

### Chord & scale constraints
Every placed note applies some constraint over what chords and scale are found appropriate for that section / the whole piece.

Every possible scale for the composition, and every possible chord for each section, are scored according to how well they fit with the notes already present. This is not a harsh constraint - some notes can fall outside of the scale/chord and that's fine, but it should be possible to provide an accurate ranking of what fits and what doesn't.

In the end, it should be possible to click on the scale / chord and get a list of all appropriate ones, ranked by how well they fit, including info like how many notes fall outside them.

When the scale or chord are chosen, their notes are faintly highlighted on the piano reel (as guides to suggest placing more notes there).

### Musical knowledge
Relationships between chords, ranking different progressions and scoring each chord based on how well it fits in that sense, is also relevant.

Include text descriptions of the chords, as well as moods, tips, where they're used. 

The editor in general should be focused on making this information very accessible (as its purpose is learning). If there's any known useful visual language (for example chord relationship maps etc) it should all be present here.
Basically - anything that might affect how appropriate a chord is for a specific piece should be accounted for.

It should be noted that since I'm a beginner here, I might not be aware of any other tools or representations that are crucial here. I could be missing important harmony-choosing concepts that are not specifically chords or scales for example. Research how simple music theory is taught and represented, and suggest changes / extra features that might be significant here.

### Style
The web app should appear very modern. Use a simplistic, friendly dark theme, and colorful accents that have meaningful meanings (like similar chords being colored similarly etc).


# Before we start
Before we start, please raise questions and challenges about this. Does this idea make sense? Should I know something about this before we begin?
