# AUT thesis subsystem

The AUT thesis is bounded to the sermon media-processing subsystem hosted by Grace Abounds NZ; it does not cover the entire church website or CMS.

The proposed workflow is:

```text
OBS recording
-> upload original video
-> create processing job
-> background worker
-> FFmpeg processing
-> subtitles
-> upload processed files
-> update database/status
-> pastor review
-> approve
-> publish/archive
```

This workflow is a proposal only. No processing jobs, queues, FFmpeg commands, subtitles, storage integration, review flow, or publishing logic exists in the scaffold. Future research is expected to consider service separation, asynchronous processing, reliability, retry/error handling, scalability, status communication, and local testability.
