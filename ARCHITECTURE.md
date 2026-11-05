# How it fits together

1. The page uploads a video (and, optionally, the MIDI a digital piano recorded) with the player's consent.
2. The server queues it. A private pipeline reads the video and its sound: SAM 3.1 on Meta's Model API finds the
   keyboard and the hands, the notes are heard and lined up with the score, and every deviation from the score and the
   reference performance is found.
3. Muse Wonder (Meta) judges which fixes a piano teacher would teach first and words the lesson, under a fact gate: a
   line that says anything the measurements do not is replaced by fixed wording.
4. The server builds the lesson's view, cuts the reference performance's hands for the taught bars only (capped per
   lesson and per piece, encrypted with a key of the lesson's own, behind links that expire), and has the lines spoken.
5. The page plays the lesson: the score as the progress bar, each fix explained, shown correctly over the player's own
   footage, and practised.

What is here: the page, the API, the Meta calls (with the Muse modules' prompts and teaching texts replaced by a marker)
and the protection of the demonstrations. What is not: the measuring pipeline, the scores, the recorded performances and
the teaching know-how (see web/_private.py).
