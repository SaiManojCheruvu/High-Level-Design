## collab-notes - real time collaborative editor

so this is a simple project i built to show how real time collaboration works without needing actual user registration or authentication. you just type in your name and start editing documents with others in real time. think google docs but way simpler and focused on showing the pattern rather than being a full product.

the whole point was to demonstrate how you can build something that feels instant and responsive when multiple people are editing the same thing. ive seen a lot of projects that claim to be real time but they either poll every few seconds or have weird delays. this one actually uses websockets properly and updates happen as you type.

## why this pattern matters

most tutorials show you basic websocket examples like chat apps where messages just append to a list. thats easy because you never have conflicts - message 1 goes on top, message 2 below it, done. but collaborative editing is way harder because two people can edit the same position at the same time. if user a is typing at position 10 and user b deletes at position 5, user a's position needs to shift. this project shows how to handle that.

the traditional approach is operational transformation which is what google docs uses. basically you transform each operation based on what happened before it so positions stay correct even when operations arrive out of order or simultaneously. i actually implemented OT initially but then disabled it because for a demo it was causing more problems than solving. the time window based approach for detecting concurrent operations wasnt reliable enough and positions were getting messed up.

so i went with a simpler model - just broadcast operations as is and let each client apply them in the order they arrive. works great for real time typing where operations are usually small and sequential. if someone pastes a huge block of text you might get weird results but for normal typing its solid.

## how the backend actually works

the backend is spring boot running on port 8081. when you open the app and type your name, the frontend generates a random user id like user-1768882736912-lr8v and stores it in localstorage. no password, no server validation, nothing. just a client side id that sticks around.

when you create a document, it hits the rest api at POST /api/docs. the backend saves the document metadata to postgresql - things like the doc id, title, who created it, when it was created. postgresql made sense here because this is structured data that doesnt change much and you want fast lookups by id.

once you open a document is when the real time stuff kicks in. your browser opens a websocket connection to ws://localhost:8081/api/ws with query params for document id, user id, and your display name. the backend keeps track of whos connected to which document using in memory hashmaps. when your websocket connects, the server sends you an initialization message with every single operation that ever happened on that document.

this is key - the document isnt stored as a text blob anywhere. its stored as a sequence of operations in mongodb. so if the document says hello world, mongodb has like 11 insert operations - insert h at 0, insert e at 1, insert l at 2, etc. when you join, you get all those operations and your frontend rebuilds the document by applying them one by one. seems inefficient but its actually pretty fast and it gives you the full edit history for free.

every time someone types a character, it becomes an operation. the frontend does a simple diff between the old content and new content to figure out what changed. if you typed h at position 0, it sends insert h at 0. if you deleted a character at position 5, it sends delete at 5. these operations go through websocket to the backend.

backend receives the operation and does a few things. first it saves it to mongodb in the operations collection. then it updates the documents updated timestamp in postgresql so you know when it was last edited. then it stores the operation in zookeeper which is this distributed coordination system. finally it broadcasts the operation to everyone else whos connected to that document via websocket.

the zookeeper part is honestly overkill for a single server demo but i wanted to show the pattern. in a real production system youd have multiple backend servers for redundancy. zookeeper ensures they all agree on the order of operations. it creates sequential nodes so operation 57 is always after operation 56 even if theyre processed by different servers. its like a distributed append only log.

when user b receives an operation from user a, their frontend checks if its from someone else and applies it immediately. it also has to be smart about cursor positions. if user b is typing at position 20 and user a inserts text at position 10, user b's cursor needs to shift right by however many characters user a inserted. otherwise user b would keep typing in the wrong spot and words would get split up.

## the databases and why i picked them

postgres stores document metadata. i needed something with acid guarantees because you dont want to lose track of what documents exist. its also good for queries like show me all documents ordered by last updated. the schema is simple - just id, title, creator, timestamps. could have used any relational db but postgres is solid and has good docker images.

mongodb stores all the operations. this is write heavy - every keystroke is a new operation. mongodb handles high write throughput really well and its schemaless so if i wanted to add new operation types later i could without migrations. operations are queried by document id and timestamp which mongodb indexes well. could have used cassandra or even postgres jsonb but mongo felt right for this use case.

zookeeper is for distributed coordination. like i said its overkill here but in production youd have multiple backend instances behind a load balancer. zookeeper makes sure they stay in sync. it provides distributed locks so only one server processes an operation at a time and sequential nodes so operations have a global order. its what kafka uses internally for the same reasons.

## websocket architecture

theres actually two websocket connections per user which might seem weird but it solves a real problem. the first is a global websocket connected to a fake document called global. this stays open the entire time youre logged in even if youre just browsing the document list. when someone creates a new document, it broadcasts through this global channel so everyones document list updates instantly.

the second websocket is document specific. when you open test doc, you connect to that documents websocket room. only people in that room see your typing. when you switch to a different document, you disconnect from the first room and connect to the second. this keeps things efficient - you only get updates for the document youre actually looking at.

the backend tracks all this with hashmaps. documentSessions maps document id to a list of websocket sessions. sessionUsers maps session id to user id. usernames maps user id to display name. when an operation comes in, the backend looks up which document its for, finds all sessions in that document room, and broadcasts to everyone except the sender.

## what i learned building this

the hardest part was definitely getting the timing right. react has this thing called stale closures where your websocket handler captures state values from when it was created. so even if currentDocument changes, the handler still sees the old value. i had to use refs instead of state in a bunch of places to fix that.

cursor position adjustment was also tricky. when you receive an operation from someone else, you need to update the content but also move your cursor if the operation happened before where you are. i tried doing this with settimeout but react would re render and reset the cursor. had to use a pending cursor position ref and apply it in a useeffect after the content updates.

the operational transformation stuff taught me why google docs is actually impressive. getting positions right when operations arrive out of order is genuinely hard. the naive approach of transforming based on timestamp windows doesnt work because network delays are unpredictable. proper OT needs to track causal relationships between operations not just time. for this demo i punted on that and just broadcast operations as is which works fine for normal typing but would break with copy paste or undo redo.

## real time updates pattern justification

ok so why build it this way instead of just polling every second or doing long polling or server sent events. websockets give you true bidirectional real time communication with minimal overhead. once the connection is established, sending an operation is just a few bytes over an already open socket. no http headers, no reconnecting, no request response cycle.

polling would mean every user hits the server every second asking are there updates. if you have 100 users thats 100 requests per second doing nothing most of the time. terrible for server resources and you still have up to 1 second of lag.

long polling is better but you still have the overhead of http and you need to reconnect after every response. server sent events are unidirectional so youd need a separate channel for sending operations to the server. websockets just make sense for this use case.

the event driven architecture means the backend doesnt need to know anything about document state. it just routes messages between clients. the real document state is the sum of all operations stored in mongodb. any client can rebuild the document from scratch by replaying those operations. this makes the backend stateless except for the websocket session tracking which is fine to keep in memory.

using mongodb for operations and postgres for metadata shows you can mix databases based on access patterns. metadata is queried by id and rarely updated so postgres is perfect. operations are append only and queried by time ranges so mongodb works great. you could put everything in one database but why not use the right tool for each job.

the zookeeper integration demonstrates how youd scale this beyond one server. right now its a single spring boot instance but in production youd want redundancy. zookeeper handles leader election, distributed locking, and sequential operation ids across servers. its the same pattern kafka and hadoop use. maybe overkill for a demo but it shows i understand distributed systems.

## running it

just docker compose up and everything spins up. postgres mongodb and zookeeper start first as dependencies then backend waits for them to be healthy before starting. frontend builds the react app and serves it through nginx. go to localhost:3000, type your name, create a document, open it in two tabs with different users, and watch it sync in real time. thats it.

the whole thing is meant to be a portfolio piece showing i can build real time systems that actually work. not just websocket hello world but handling concurrent users, state synchronization, cursor positions, presence detection, all the stuff that makes collaboration feel smooth.

## how to actually run this on your computer

ok so if you want to try this yourself heres exactly what you need to do. im gonna explain it step by step like youve never done this before.

first you need docker installed on your computer. docker is basically a way to run applications in containers so you dont have to install postgres, mongodb, java, node, and all that stuff separately. just google docker desktop for mac or docker desktop for windows, download it, and install it like any normal application. once its installed you should see a whale icon in your menu bar or system tray. make sure its actually running - the whale should not have a red X on it.

next you need to get this code onto your computer. if youre reading this on github, look for the green code button and click download zip. extract the zip file somewhere like your downloads folder or desktop. you should end up with a folder called collab-notes with subfolders backend and frontend inside.

now open a terminal. on mac you can press cmd space and type terminal. on windows you can press windows key and type cmd or use powershell. this is gonna feel weird if youve never used a terminal but i promise its not scary.

in the terminal you need to navigate to where you extracted the code. if you put it in downloads you would type cd downloads/collab-notes and press enter. cd means change directory which is just moving to a different folder. you can type ls on mac or dir on windows to see whats in the current folder. you should see backend, frontend, docker-compose.yml, and README.md listed.

once youre in the right folder, type this command and press enter:

docker-compose up -d

thats it. docker will start downloading a bunch of stuff which might take a few minutes the first time. youll see it pulling postgres, mongodb, zookeeper, building the backend, building the frontend. just let it do its thing. the -d flag means run in detached mode so it runs in the background.

when its done you can check if everything is running by typing:

docker-compose ps

you should see five containers listed - postgres, mongodb, zookeeper, backend, and frontend. they should all say up or running in the status column. if any say exited or restarting something went wrong.

assuming everything is running, open your web browser and go to:

http://localhost:3000

you should see the login screen. type any name you want - it doesnt matter, theres no password or anything. click start collaborating and youll see the main app.

now to actually test the real time features, you need two browser windows. easiest way is to right click the tab and select duplicate tab or just copy paste localhost:3000 into a new tab. in the second tab use a different name when you login. now you have two users.

create a document in one tab by clicking the plus new document button. give it a name like test doc. both tabs should see the new document appear in the list on the left. click on it in both tabs so both users are editing the same document.

start typing in one tab. you should see the text appear character by character in the other tab without refreshing. thats the real time sync working. you should also see the other users cursor position updating in the active users list on the left side.

if you want to stop everything, go back to the terminal and type:

docker-compose down

this stops all the containers and cleans up. if you want to start fresh and delete all the data including documents you created, type:

docker-compose down -v

the -v flag removes the volumes which is where the databases store their data.

## troubleshooting if something breaks

if the page doesnt load at localhost:3000, check if the frontend container is actually running with docker-compose ps. if it says exited you can check the logs with docker logs collab-notes-frontend. usually if the frontend fails its because the build failed which would be weird because it should work out of the box.

if the websocket doesnt connect or you see disconnected in red at the top, check the backend logs with docker logs collab-notes-backend. make sure you see a line that says tomcat started on port 8081. if the backend crashes on startup its usually because postgres or mongodb isnt ready yet but the docker compose file has health checks to prevent that.

if text isnt syncing between users, open the browser console by pressing f12 and look for errors. you should see websocket messages being sent and received. if you see document id mismatch in the logs it means the frontend and backend are out of sync somehow. refresh both tabs with a hard refresh - cmd shift r on mac or ctrl shift f5 on windows.

sometimes docker gets in a weird state especially if you stopped containers while they were still starting up. if nothing works just do docker-compose down, wait a few seconds, then docker-compose up -d again. fresh start usually fixes it.

## what you need installed

just docker desktop. thats literally it. you dont need java, you dont need node, you dont need postgres or mongodb or zookeeper installed directly on your computer. docker handles all of that. this is why docker is great - the entire environment is defined in code so it works the same on everyones machine.

if you really want to run it without docker you would need java 11, maven, node 16, postgres, mongodb, and zookeeper all installed and configured correctly which is a huge pain. dont do that unless you have a specific reason. docker is the way.

## ports this uses

just fyi the application uses these ports on your computer:

- 3000 for the frontend web app
- 8081 for the backend api and websocket
- 5433 for postgres (different from standard 5432 to avoid conflicts)
- 27018 for mongodb (different from standard 27017 to avoid conflicts)
- 2182 for zookeeper (different from standard 2181 to avoid conflicts)

i changed the database ports from their defaults because a lot of developers already have postgres or mongo running locally for other projects. using different ports means this wont conflict with anything else you have running. if you see errors about ports already being in use you either have something else using those ports or you tried to start this twice. do docker-compose down first then try again.

