#!/bin/bash
source venv/bin/activate
celery -A workers.celery_app worker --loglevel=info --pool=solo
