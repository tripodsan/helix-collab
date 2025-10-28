# Helix Collab Service

Implements the collab service for document authoring in AWS. It uses the Y protocol to sync the
updates via websockets. due to the nature of the websocket support in AWS a lambda function
is invoked for every message received. this makes keeping state a bit more difficult.

- the open "sessions" per document are stored in dynamodb, in the `connections` table.
- for each document the incremental updates are stored in the `documents` table
- since dynamodb has a limit of 400kb per entry, a document that gets larger is also serialized to s3
- (each document is also cached in memory, assuming that the same function container is reused)
- 
