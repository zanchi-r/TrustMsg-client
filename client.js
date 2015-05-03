process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
var fs = require('fs');
var io = require('socket.io-client'),
  socket = io.connect('https://localhost:8000', {secure: true});
var privKey = '';
var loggedIn = false;

function addToChat(content) {
  var chatContainer = document.getElementById("chat-container");
  var newElement = document.createElement('div');
  newElement.classname = "chat-elem";
  newElement.innerHTML = content;
  chatContainer.appendChild(newElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function register(username, password) {
  socket.on('create_account_response', function(data) {
    if (data.result == 'ok') {
      addToChat("User "+username+" successfully created");
    } else {
      addToChat("Error: Can't create an account on the server: " + data.error);
    }
  });
  socket.emit('create_account', {
    username: username,
    password: password
  });
}

function login(username, password) {
  socket.on('login_response', function(data) {
    if (data.result == 'ok') {
      loggedIn = true;
      addToChat("Logged In!");
    } else {
      addToChat("Error: Can't login on the server: " + data.error);
    }
  });
  socket.emit('login', {
    username: username,
    password: password
  });
}

function sendMessage(msg) {
  socket.emit('message', msg);
  addToChat('me: ' + msg);
}

function help() {
  addToChat('TrustMsg 0.0.1<br/>/register username password<br/>/login username password<br/>message<br/>/exit');
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
