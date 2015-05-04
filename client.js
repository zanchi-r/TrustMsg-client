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

function getGroupID(name) {
  var id;
  try {
    var id = fs.readFileSync('.groups/'+name+'.id' ,'utf8')
  } catch (e) {
    id = undefined;
  }
  return (id);
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

function prepareMessage(line) {
  var msgRegexp = new RegExp("/msg\\s+(\\S+)\\s+(.*)");
  var match = msgRegexp.exec(line);
  if (match == null) {
    addToChat('Error: /msg: Bad format');
    return (undefined);
  } else {
    // TODO : encrypt message
    return ({
      username: match[1],
      message: match[2]
    });
  }
}

function prepareGroupMessage(line) {
  var grpRegexp = new RegExp("/grpmsg\\s+(\\S+)\\s+(.*)");
  var result = grpRegexp.exec(line);
  if (result == null) {
    addToChat('Error: /msg: Bad format');
    return (undefined);
  } else {
    var groupID = getGroupID(match[1]);
    if (groupID == undefined)
      return (undefined);
    // TODO : encrypt message
    return ({
      groupID: groupID,
      groupName: match[1],
      message: match[2]
    });
  }
}

socket.on('message_received', function(data) {
  var msg = data.message;// TODO : decrypt message
  if (data.groupName != undefined) {
    addToChat('<strong class="group-msg">' + data.groupName + '</strong>: ' + msg);
  } else {
    addToChat('<strong class="msg">' + data.usernameFrom + '</strong>: ' + msg);
  }
});

socket.on('send_message_response', function(data) {
  if (data.result == 'ko') {
    addToChat("Error: Can't send message: " + data.error);
  }
});

function sendMessage(line) {
  var msg = prepareMessage(line);
  if (msg != undefined) {
    var regexp = new RegExp("\\S+\\s+(\\S+)\\s+(.*)");
    var match = regexp.exec(line);
    socket.emit('send_message', msg);
    addToChat('<strong class="msg">me to ' + match[1] + ':</strong> ' + match[2]);
  }
}

function sendGroupMessage(line) {
  var msg = prepareGroupMessage(line);
  if (msg != undefined) {
    var regexp = new RegExp("\\S+\\s+(\\S+)\\s+(.*)");
    var match = regexp.exec(line);
    socket.emit('send_message', msg);
    addToChat('<strong class="group-msg">me to ' + match[1] + ':</strong> ' + match[2]);
  }
}

function exportMessage(msg) {
  //export encrypted message
}

function getMessages() {
  //get_messages
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

socket.on('add_user_to_group_response', function(data) {
  if (data.result == 'ok') {
    addToChat(data.username + " added to " + data.groupName);
  } else {
    addToChat("Error: Can't add " + data.username + " to " + data.groupName + ": " + data.error);
  }
});

function addUserToGroup(groupName, username) {
  var groupID = getGroupID(groupName);
  if (groupID) {
    socket.emit('add_user_to_group', {
      groupID: groupID,
      groupName: groupName,
      username: username
    });
  } else {
    addToChat("Error: Group " + groupName + " does not exists");
  }
}

socket.on('remove_user_from_group_response', function(data) {
  if (data.result == 'ok') {
    addToChat(data.username + " removed from " + data.groupName);
  } else {
    addToChat("Error: Can't remove " + data.username + " from " + data.groupName + ": " + data.error);
  }
});

function removeUserFromGroup(groupName, username) {
  var groupID = getGroupID(groupName);
  if (groupID) {
    socket.emit('remove_user_from_group', {
      groupID: groupID,
      groupName: groupName,
      username: username
    });
  } else {
    addToChat("Error: Group " + groupName + " does not exists");
  }
}

socket.on('get_group_list_response', function(data) {
  if (data.result == 'ok') {
    var result = 'Group list:<br/>';
    data.groups.forEach(function(group) {
      result += group.name + '<br/>';
    });
    addToChat(result);
  } else {
    addToChat("Error: Can't get group list: " + data.error)
  }
});

function getGroupList() {
  socket.emit('get_group_list');
}

socket.on('get_users_in_group_response', function(data) {
  if (data.result == 'ok') {
    var result = 'Users in ' + data.groupName + ':<br/>';
    data.usernames.forEach(function(username) {
      result += username + '<br/>';
    });
    addToChat(result);
  } else {
    addToChat("Error: Can't get usernames in the group " + data.groupName + ": " + data.error)
  }
});

function getUsersInGroup(name) {
  var groupID = getGroupID(name);
  if (groupID) {
    socket.emit('get_users_in_group', {
      groupID : groupID,
      groupName: name
    });
  } else {
    addToChat("Error: Group " + name + " does not exists");
  }
}

function help() {
  addToChat("TrustMsg 0.0.1<br/>\
            /register username password<br/>\
            /login username password<br/>\
            Once logged in:<br/>\
            /msg user message<br/>\
            /grpmsg group message<br/>\
            /getStatus username<br/>\
            /createGroup name<br/>\
            /addUserToGroup groupName username<br/>\
            /removeUserFromGroup groupName username<br/>\
            /getGroupList<br/>\
            /getUsersInGroup name<br/>\
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
      var line = input.value.trim();
      var argv = line.split(" ");
      input.value = '';
      switch(argv[0]) {
        case '/register':
          register(argv[1], argv[2]);
          break;
        case '/login':
          login(argv[1], argv[2]);
          break;
        case '/msg':
          sendMessage(line);
          break;
        case '/grpmsg':
          sendGroupMessage(line);
          break;
        case '/getStatus':
          getStatus(argv[1]);
          break;
        case '/createGroup':
          createGroup(argv[1]);
          break;
        case '/addUserToGroup':
          addUserToGroup(argv[1], argv[2]);
          break;
        case '/removeUserFromGroup':
          removeUserFromGroup(argv[1], argv[2]);
          break;
        case '/getGroupList':
          getGroupList();
          break;
        case '/getUsersInGroup':
          getUsersInGroup(argv[1]);
          break;
        case '/help':
          help();
          break;
        case '/exit':
          exit();
        default:
          addToChat(line + ": Command not found");
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
