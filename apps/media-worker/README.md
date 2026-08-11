# Media worker

This application is intentionally separated from the web and API applications. Future sermon media processing will be long-running, resource-intensive work and must not run inside the normal HTTP request/response lifecycle.

This scaffold does not contain queues, FFmpeg commands, storage integration, uploads, or sermon-processing logic.
