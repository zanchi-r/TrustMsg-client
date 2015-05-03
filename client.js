process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
var fs = require('fs');
var io = require('socket.io-client'),
  socket = io.connect('https://localhost:8000', {secure: true});
var privKey = '';
var username = undefined;
var loggedIn = false;

function addToChat(content) {
  var chatContainer = document.getElementById("chat-container");
  var newElement = document.createElement('div');
  newElement.classname = "chat-elem";
  newElement.innerHTML = content;
  chatContainer.appendChild(newElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

socket.on('create_account_response', function(data) {
  if (data.result == 'ok') {
    addToChat("User " + data.username + " successfully created");
  } else {
    addToChat("Error: Can't create an account on the server: " + data.error);
  }
});

function register(username, password) {
  socket.emit('create_account', {
    username: username,
    password: password
  });
}

socket.on('login_response', function(data) {
  if (data.result == 'ok') {
    loggedIn = true;
    username = data.username;
    addToChat("Logged In!");
  } else {
    addToChat("Error: Can't login on the server: " + data.error);
  }
});

function login(username, password) {
  socket.emit('login', {
    username: username,
    password: password
  });
}

function uploadKey() {
  //save_public_key
}

function getPublicKey(username) {
  //get_public_key
}

socket.on('get_status_response', function(data) {
  if (data.result == 'ok') {
    addToChat(data.username + ": " + data.status);
  } else {
    addToChat("Error: Can't get status of :" + data.error);
  }
});

function getStatus(username) {
  socket.emit('get_status', {
    username: username
  });
}

function sendMessage(msg) {
  socket.emit('message', msg);
  addToChat('me: ' + msg);
}

function getMessages() {
  //get_messages
}

socket.on('create_group_response', function(data) {
  if (data.result == 'ok') {
    fs.mkdir('.groups', function(err) {
      fs.writeFile('.groups/'+data.name+'.id', data.groupID, function(err) {
        if (err) throw err;
        addToChat("Group " + data.name + " successfully created");
      });
    });
  } else {
    addToChat("Error: Can't create the group " + data.name +":" + data.error);
  }
});

function createGroup(name) {
  var usernames = [];
  usernames.push(username)
  socket.emit('create_group', {
    name: name,
    usernames: usernames
  })
}

function addUserToGroup(groupName, username) {
  //add_user_to_group
}

function removeUserFromGroup(groupName, username) {
  //remove_user_from_group
}

function getGroupList() {
  //get_group_list
}

function getUsersInGroup(name) {
  //get_users_in_group
  //Need to be done on the server
}

function help() {
  addToChat("TrustMsg 0.0.1<br/>\
            /register username password<br/>\
            /login username password<br/>\
            Once logged in:<br/>\
            /getStatus username<br/>\
            /createGroup name<br/>\
            message<br/>\
            /exit");
}

function exit() {
  socket.emit('disconnect');
  addToChat('Disconnected');
  process.exit(0);
}

function inputKeyPress(e)
{
  e = e || window.event;
  if (e.keyCode == 13)
  {
      var input = document.getElementById("chat-input");
      var line = input.value
      var argv = line.trim().split(" ");
      input.value = '';
      switch(argv[0]) {
        case '/register':
          register(argv[1], argv[2]);
          break;
        case '/login':
          login(argv[1], argv[2]);
          break;
        case '/getStatus':
          getStatus(argv[1]);
          break;
        case '/createGroup':
          createGroup(argv[1]);
          break;
        case '/help':
          help();
          break;
        case '/exit':
          exit();
        default:
          if (loggedIn) {
            sendMessage(line);
          } else {
            addToChat('Please login or register first.');
          }
          break;
      }
  }
}

function main() {
  window.frame = false;
  socket.on('connect', function() {
    addToChat('Connected! please login or register first. For more details /help');
  });
}

main();
