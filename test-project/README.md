# Key-Value Message App (Example)

This is a tiny message app that stores conversations in a key-value store. The key is a conversation ID (two user names sorted and joined), and the value is the full message list for that conversation.

## Run

```bash
node server.js
```

Then open `http://localhost:3000`.

## How the Key-Value Store Works

- `conversationId -> { participants, messages[] }`
- `user -> Set(conversationId)` index for listing threads

You can view the current store snapshot in the UI.
