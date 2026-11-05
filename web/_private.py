"""The modules this public copy leaves out: the measuring pipeline and our data, and the teaching know-how, and the other routes to Meta's models. They run on our server behind the API."""
PRIVATE = ["analysis", "camera", "compare", "demos", "eval_take", "eval_transcribe", "exercises", "fingering", "handcheck", "lesson", "lesson_view", "library", "make_sample", "muse", "onkeys", "open_api", "openrouter_api", "pipeline", "pov", "proref", "refcompare", "score_assets", "scorealign", "teacher_performances", "teacher_tools", "transcribe", "video", "voicepack", "window"]


def missing(name):
    """A clear error for a module of PRIVATE that is not here."""
    return ImportError(f"{name} is private: it runs on the Museverse server behind the API, not in this repository")
