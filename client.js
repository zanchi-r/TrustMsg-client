#!/usr/bin/env node
var fs = require('fs');
var readline = require('readline'),
  rl = readline.createInterface(process.stdin, process.stdout);
var io = require('socket.io-client'),
  socket = io.connect('http://localhost:8000');
var privKey = '';
var loggedIn = false;

function register(username, password) {
  socket.on('create_account_response', function(data) {
    if (data.result == 'ok') {
      console.log("Account successfully created");
      fs.mkdir('.keys', function(err) {
        fs.writeFile('.keys/'+username+'.key', data.key, function(err) {
          if (err) throw err;
        });        
      });
      privKey = data.key;
    } else {
      console.log("Error: Can't create an account on the server: " + data.error);
    }
  });
  socket.emit('create_account', {
    username: username,
    password: password
  });
}

function login(username, password) {
  fs.readFile('.keys/'+username+'.key', 'utf8', function(err, data) {
    if (err) {
      console.log('Error: No private key found for this user');
      return ;
    }
    privKey = data;
    socket.on('login_response', function(data) {
      if (data.result == 'ok') {
        loggedIn = true;
        console.log("Logged In!");
      } else {
        console.log("Error: Can't login on the server: " + data.error);
      }
    });
    socket.emit('login', {
      username: username,
      password: password
    });
  });
}

function sendMessage(msg) {
  socket.emit('message', msg);
  console.log('me: ' + msg);
}

function help() {
  console.log('TrustMsg 0.0.1\n/register username password\n/login username password\nmessage\n/exit');
}

function exit() {
  socket.emit('disconnect');
  console.log('Disconnected');
  process.exit(0);
}

function mainLoop() {
  rl.setPrompt('TrustMsg> ');
  rl.prompt();
  rl.on('line', function(line) {
    var argv = line.trim().split(" ");
    switch(argv[0]) {
      case '/register':
        register(argv[1], argv[2]);
        break;
      case '/login':
        login(argv[1], argv[2]);
        break
      case '/help':
        help();
        break;
      case '/exit':
        exit();
      default:
        if (loggedIn) {
          sendMessage(line);
        } else {
          console.log('Please login or register first.');
        }
        break;
    }
    rl.prompt();
  }).on('close', function() {
    exit();
  });
}

function main() {
  socket.on('connect', function() {
    console.log('Connected! please login or register first. For more details /help');
    mainLoop();
  });
}

main();
