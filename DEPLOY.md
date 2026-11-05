# Deploying

The server runs as one CPU container on Modal (`deploy/modal/modal_app.py`); every model runs on Meta's Model API. The
secrets (the access token, the judges' codes, the Meta key) live only in Modal's secret store. The private parts of the
build (web/_private.py) are needed to run it.
