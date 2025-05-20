## UI Architecture
Core Structure
- SvelteKit is used for the UI framework
- Skeleton and Tailwind CSS are used for styling
- Mobile first approach
- Tauri is used for packaging the desktop application

### Basic flow
- App starts from `app.html`, which sets up the HTML shell and loads the SvelteKit app.
- SvelteKit's file based routing is used which is similar to Next.js's routing. 
- Each file in `src/routes` directory corresponds to a route in the app.
- `+layout.svelte` provides the main layout for the app, handles the global state and handles the rendering of appropriate page or onboarding flow.
- App uses a custom theme defined in `volla-theme.ts`.
- Uses Svelte's stores for shared state management i.e. `src/store`.
- Follows a component based architecture where each component is defined in `src/lib` and can be reused across the app.
- Static assets like images are in `static` folder.
- Helper functions are in `utils.ts`.

### App flow
- On the launch of the app, it loads the `app.html` file.
- The `app.html` file loads the SvelteKit app.
- SvelteKit initialises, and the root layout `layout.svelte` is loaded
- `layout.svelte` sets up the global context, initialises all the stores, and handles theming

#### Global context & Store Initialisation
It compises of three main steps:
1. **Holochain Client Connection**
    - `layout.svelte` handles the connection with the Holochain backend using `initHolochainClient()` function, which 
    - Connects the tauri app to the Holochain conductor using the `@holochain/client` library
    - Waits for the relay cell to be ready via `callZome` ping
    - Fetches app info and the provisioned relay cell ID
    - Sets `isClientConnected = true` if successful
2. **Store Setup**
    - Initialises all the stores using `initStore()`
    - Initialises each store's data from the backend
    - Sets up real-time signal handlers for handling the signals from the backend
    - Sets `isStoresSetup = true` when stores are setted up
3. **Context Providers**
    - All stores and key values are provided to the rest of the app via `setContext`
    - It allows any component or page to access the stores via `getContext`

#### Onboarding Flow
It has two different flows:
1. **First time users**
    - `+layout.svelte` checks for the user profile, if it doesn't exist, it redirects to the onboarding flow'
    - Onboarding flow is handled by `ProfileSetupName.svelte` and `ProfileSetupAvatar.svelte`, and profile is setted up via `ProfileStore.createProfile()`
2. **Existing users**
    - If the user profile exists, client is connected and the stores are set up, it redirects to the main app flow
    - Main app UI is rendered via `<slot />`, which loads the current route/page (page can be anything in /src/routes)
    - All pages and components have access to the initalised stores and context

#### User Flow
- **Conversations**
    - All conversations are displayed using `ConversationList.svelte` component
    - Data is loaded from `ConversationStore`
    - Opening a conversation loads its messages using `ConversationMessageStore`
    - New conversations (private/public) are created from `conversations/new` which calls `conversationStore.create()`
    - User can join the conversation via an invite code, which is handled in `conversations/join` which calls `conversationStore.join()`
    - Private conversations requires a contact to be created first, and other user with the invite code can join the conversation
    - Public conversations can be joined by anyone with the invite code 
- **Contacts**
    - Lists all the contacts using `ContactStore`
    - New contact can be added via `contacts/new` which calls `contactStore.create()`
    - QR code scanning is handled via `routes/scan`, which is managed by `ScanStore.ts`
    - Creating a contact also creates a private conversation and redirects to the conversation page.

- FileUploads are managed by `FileStore`
- Notifications are managed by `enqueNotification` defined in `utils.ts`

### Stores
Every feature of the app is managed by a store, which is a Svelte Store. Each store is responsible for managing its own state and providing methods to interact with the backend; stores abstract away the logic for fetching, updating, and synchronising data with the backend, exposing a API for components to use.

1. **ProfileStore.ts**
- Manages user profiles, including creation, update and retrieval of profile data for the current user and others in the chat.
- Profiles are stored per Holochain cell
- Supports creating and updating tge user's profile across all relay cells
- Provides derived stores for accessing profiles in a specific cell
- `initialize()` loads all profiles from all relay cells into the store
- `createProfile(value)` creates the user's profile in all relay cells
- `updateProfile(value)` updates the user's profile in all relay cells
- `load(CellIdB64)` loads profiles for a specific cell
- `subscribe(run)` svelte store subscription for profile data

2. **ContactStore.ts**
- Manages user's contacts, including creation, update, deletion, and retrieval.
- Contacts are keyed by the agent's public key.
- Each contact is associated with a private conversation cell.
- Provides methods to create, update, and delete contacts, as well as to initialize the contact list from the backend.
- `initialize()` loads all contacts from the backend.
- `create(value, cellIdB64)` adds a new contact (requires an existing private conversation cell).
- `update(key, value)` updates an existing contact.
- `delete(agentPubKeyB64)` deletes a contact.
- `subscribe(run)` svelte store subscription for contact data.

3. **ConversationStore.ts**
- Manages conversations, including creation, joining, enabling/disabling, configuration, and unread status.
- Conversations are keyed by cell ID
- Supports both private and group conversations
- Unread status is persisted locally not in DHT
- Provides derived stores for accessing and manipulating a single conversation
- `initialize()` loads all conversations from the backend
- `create(input)` creates a new conversation
- `join(input)` joins a conversation via invitation
- `enable(key)`,`disable(key)` enables/disables a conversation cell
- `loadConfig(key)` loads the configuration for a conversation
- `updateConfig(key, value)` updates the configuration
- `updateUnread(key, value)` sets the unread status
- `makePrivateInviteCode(key, agentPubKeyB64, title)` generates a private invite code
- `getBucket(key, timestamp)` calculates the message bucket for a timestamp
- `subscribe(run)` svelte store subscription for conversation data

4. **ConversationMessageStore.ts**
- Manages messages within conversations, including sending, deleting, loading, and handling real time signals
- Messages are stored per conversation cell
- Supports loading messages in "buckets" for efficient pagination
- Handles message sending, deletion, and signal processing for real time updates
- Provides derived stores for accessing messages in a specific conversation
- `initialize()` initializes the message store
- `loadMessagesInCurrentBucketTargetCount(key, ...)` loads messages in the current bucket up to a target count
- `loadMessagesInPreviousBucketTargetCount(key, ...)` loads older messages
- `sendMessage(key, content, files)` sends a message (optionally with files)
- `deleteMessage(key, actionHashB64)` deletes a message
- `handleMessageSignalReceived(key, signal)` handles incoming message signals
- `handleMessageDeletedSignalReceived(key, actionHashB64)` handles message deletion signals
- `subscribe(run)` svelte store subscription for message data

5. **ConversationLatestMessageStore.ts**
- Provides a derived store that tracks the latest message in each conversation
- Combines data from the conversation and message stores
- Sorts conversations by the timestamp of their latest message
- `subscribe(run)` svelte store subscription for latest message data

6. **ConversationTitleStore.ts**
- Manages conversation titles, combining information from conversations, profiles, and contacts
- Titles are derived and persisted locally
- Updates when underlying conversation or contact data changes
- `subscribe(run)` Svelte store subscription for conversation titles

7. **FileStore.ts**
- Handles file uploads and downloads for conversations
- Files are managed per conversation cell
- Uses Holochain's file storage zome for backend operations
- Tracks file status (loading, loaded, error)
- `upload(cellIdB64, file)` uploads a file to a conversation
- `download(cellIdB64, entryHashB64)` downloads a file, with retry logic
- `subscribe(run)` svelte store subscription for file data

8. **ScanStore.ts**
- Manages the QR code scanning flow, including navigation and result handling
- Handles navigation to/from the scan page
- Stores scan results and supports reading/resetting them
- Detects platform support for scanning
- `scan()` initiates the scan flow
- `complete(newValue)` completes the scan and navigates back
- `reset()` resets the scan state
- `readResult()` reads and clears the scan result
- `subscribe(run)` svelte store subscription for scan state

9. **Generic Stores**
- Provide reusable, generic store implementations for key-value and key-key-value data structures.
- Backbone of all the stores, used as foundation for all feature specific stores
- `GenericKeyValueStore.ts`
    - Manages a mapof key-value pairs, where each key is a string and the value is a typed object (e.g., `profile`, `contact`, `message` etc.)
    - Used as the base for stores like `ContactStore`, `ConversationStore` and `FileStore`
    - `getKeyValue(key)` retrieves a value by key
    - `setKeyValue(key, value)` sets a value by key
    - `updateKeyValue(key, value)` updates a value for a key
    - `removeKeyValue(key)` remove a value by key
    - `subscribe(run)` svelte store subscription for entire map
- `GenericKeyKeyValueStore.ts`
    - Manages a nested map structure, where data is organised as `outerKey -> innerKey -> value`
    - Useful for cases where data is grouped by a primary key and then by a secondary key i.e. cellId and agentPubKey
    - Used by `ProfileStore`(profiles per cell and agent) , `ConversationMessageStore`(messages per conversation/cell), etc
    - `getKeyKeyValue(outerKey, innerKey)` retrieves a value by outer and inner key
    - `setKeyKeyValue(outerKey, innerKey, value)` sets a value by outer and inner key
    - `updateKeyKeyValue(outerKey, innerKey, value)` updates a value for outer and inner key
    - `removeKeyKeyValue(outerKey, innerKey)` removes a value by outer and inner key
    - `subscribe(run)` svelte store subscription for the nested map
- `GenericPersistedStore.ts`
    - Used for persisting store data to localStorage
    - Unread Status and Conversation titles are persisted using this store

10. **MergedProfileContactInviteStore.ts**
- Combines data from profiles, contacts, and invites into a single derived store
- Allows the UI to display the most relevant information for each agent
- `Working:`
    - Listens to changes in `ProfileStore`, `ContactStore`, and `InviteStore`
    - For each agent, if a contact exists, transforms it into a profile like object; otherwise, uses the profile
    - Used throughout the app to display user/contact info in conversations and contact lists

11. **MergedProfileContactInviteJoinedStore.ts** & **MergedProfileContactInviteUnjoinedStore.ts**
- Derived stores that split agents into those who have joined a conversation and those who have not, based on invites and profiles
- Used in conversation details and member lists to show who is part of a conversation and who is invited but not yet joined

12. **InviteStore.ts**
- Manages invitations for joining conversations
- `invite(agentPubKeyB64, cellIdB64)` sends an invite to a user for a specific conversation
- `subscribe(run)` svelte store subscription for invite data

13. **SignalHandler.ts**
- Handles real time signals from the Holochain backend and updates the relevant stores
- **Working:**
    - Listens for signals using the Holochain client’s `.on("signal", ...)` API
    - Decodes the signal payload and dispatches updates to the appropriate stores (like `ConversationMessageStore`, `ConversationStore`)
    - Handles message creation, deletion, and other entry/link signals
    - Ensures the UI stays in sync with backend events, such as new messages, deleted messages, or membership changes

14. **RelayClient.ts**
- Main abstraction for all Holochain interactions
- Provides methods for all CRUD operations on profiles, contacts, conversations, messages, files, and invites
- Handles cell management (creating/joining/enabling/disabling conversation cells)
- Wraps all zome calls and manages cell IDs, agent keys, and payload formatting
- Used by all stores to interact with the backend, ensuring a single point of integration
- Handles flows like generating membrane proofs, fetching all agents with profiles, and managing file uploads/downloads
- All methods return Promises and are used by the feature stores for data synchronization

### For understanding the flow, we can take an example of, how a message is sent?
1. **User types a message and clicks Send ([`ConversationMessageInput.svelte`](../src/routes/conversations/[id]/ConversationMessageInput.svelte))**
   - User enters text and/or attaches files, then submits the form.
   - Component dispatches a `send` event with `{ text, files }`.

2. **Parent page handles the send event ([`+page.svelte`](../src/routes/conversations/[id]/+page.svelte))**
   - Listens for the `send` event:
   - Calls the `sendMessage` function, which in turn calls `messages.sendMessage(text, files)`
   - `messages` is the derived store for the current conversation, from [`ConversationMessageStore.ts`](../src/store/ConversationMessageStore.ts).

3. **Store handles sending the message ([`ConversationMessageStore.ts`](../src/store/ConversationMessageStore.ts))**
   - `sendMessage(cellIdB64, content, files)` method is used
     - If files are attached, each file is uploaded via `FileStore.upload(cellIdB64, file)` method in [`FileStore`](../src/store/FileStore.ts)
     - After files are uploaded, their references are included in the message.
     - Store gathers all agent public keys in the conversation using [`MergedProfileContactInviteStore`](../src/store/MergedProfileContactInviteStore.ts) and prepares a `SendMessageInput` object.

4. **RelayClient sends the message to the backend ([`RelayClient.ts`](../src/store/RelayClient.ts))**
   - `RelayClient.createMessage(cellId, payload)` method is called which in turn makes a zome call to the Holochain backend to create the message entry.

5. **Backend processes the message ([`message.rs`](../../dnas/relay/zomes/coordinator/relay/src/message.rs))**
   - `create_message` function stores the message entry, links it to the correct bucket, and emits a signal to all agents in the conversation.

6. **SignalHandler receives the real time signal ([`SignalHandler.ts`](../src/store/SignalHandler.ts))**
   - Listens for signals using the Holochain client’s `.on("signal", ...)` API.
   - Decodes the signal and dispatches it to the appropriate store, for new messages, it calls `ConversationMessageStore.handleMessageSignalReceived(cellIdB64, signal)`

7. **Store updates local state ([`ConversationMessageStore.ts`](../src/store/ConversationMessageStore.ts))**
   - `handleMessageSignalReceived` method receives the signal and:
     - Adds the new message to the local store.
     - Triggers a notification if the message is from another user.

8. **UI updates automatically ([`ConversationMessages.svelte`](../src/routes/conversations/[id]/ConversationMessages.svelte))**
   - Subscribes to the messages store and re renders the message list in real time.
   - Ensures that any new messages are displayed immediately without requiring a page refresh.
