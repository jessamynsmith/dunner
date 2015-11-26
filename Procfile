web: gunicorn project:app
worker: celery worker --app=tasks.celery -l INFO
