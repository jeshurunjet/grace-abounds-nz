# Architecture

Grace Abounds NZ currently has three application boundaries:

- the Next.js web application presents browser interfaces;
- the Node.js API will own HTTP-facing application operations;
- the media worker reserves a separate process for future long-running work.

Shared packages reserve boundaries for database access, types, validation, configuration, and UI components. PostgreSQL is available locally through Docker Compose. The data model and communication details have deliberately not been designed yet.

The worker boundary prevents future CPU- and time-intensive media processing from running in a normal web request. Queue technology, storage provider, deployment topology, and operational policies remain future decisions.
