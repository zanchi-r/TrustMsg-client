// Accept unauthorized tls connection because we generated the certificate
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/*
** Load needed modules
*/
var fs = require('fs');
var keypair = require('keypair');
var forge = require('node-forge');
var NodeRSA = require('node-rsa');
// Load socket io client and connect to the main server in SSL
var io = require('socket.io-client'),
  socket = io.connect('https://localhost:4242', {secure: true});

// Global variables
var privKey = '';
var current_username = undefined;
var loggedIn = false;

/*
** Add content to chat
** Create a new div element and append it to the chat-container
** Params:
**   - content: The inner HTML of the new element
*/
function addToChat(content) {
  var chatContainer = document.getElementById("chat-container");
  var newElement = document.createElement('div');
  newElement.classname = "chat-elem";
  newElement.innerHTML = content;
  chatContainer.appendChild(newElement);
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

/*
** Get group id from the name of the group
** Params:
**   - name: the group name
** Returns: the group id
*/
function getGroupID(name) {
  var id;
  try {
    var id = fs.readFileSync('./.trustmsg/'+current_username+'/groups/'+name+'.id','utf8');
  } catch (e) {
    id = undefined;
  }
  return (id);
}

/*
** Handle a message received
** Decipher message and add it to the chat
** Params:
**   - data: data received from the server
*/
function messageReceived(data) {
  var msg = data.message;
  if (data.groupName != undefined) {
    addToChat('<strong class="group-msg">' + data.groupName + '</strong>: ' + msg);
  } else {
    var key = fs.readFileSync('./.trustmsg/'+current_username+'/keys/'+data.usernameFrom+'.sym','utf8');
    if (!key) {
      addToChat("Error: message received from " + data.usernameFrom + ": key not found");
    } else {
      var input = forge.util.createBuffer(msg);
      var decipher = forge.cipher.createDecipher('AES-CBC', key);
      decipher.start({iv: ''});
      decipher.update(input);
      decipher.finish();
      addToChat('<strong class="msg">' + data.usernameFrom + '</strong>: ' + forge.util.createBuffer(decipher.output.toString('utf8')));
    }
  }
}

/*
** Handle create account response from the server
** Check if the creation succeed and show a message in the chat
** Params:
**   - data: data received from the server
*/
socket.on('create_account_response', function(data) {
  if (data.result == 'ok') {
    addToChat("User " + data.username + " successfully created");
  } else {
    addToChat("Error: Can't create an account on the server: " + data.error);
  }
});

/*
** Register a user on the server
** Emit a message to the socket to register the new account on the server
** Params:
**   - username: username of the new account
**   - password: plain text password of the new account
*/
function register(username, password) {
  socket.emit('create_account', {
    username: username,
    password: password
  });
}

/*
** Handle the login response from the server
** Check if we are logged in.
** Upload the public key of the user.
** Get the pending messages.
** Params:
**   - data: data received from the server
*/
socket.on('login_response', function(data) {
  if (data.result == 'ok') {
    loggedIn = true;
    current_username = data.username;
    fs.mkdir('./.trustmsg/'+current_username+'/', function(err) {
      if (err && err.code != 'EEXIST') throw err;
      uploadKey();
      getKeyExchanges();
      addToChat("Logged In!");
      getMessages();
    });
  } else {
    addToChat("Error: Can't login on the server: " + data.error);
  }
});

/*
** Login on the server
** Emit a message to the socket to login the user on the server
** Params:
**   - username: username of the account
**   - password: plain text password of the account
*/
function login(username, password) {
  socket.emit('login', {
    username: username,
    password: password
  });
}

/*
** Handle save public key response from the server
** Check if the key was successfully uploaded on the server.
** Params:
**   - data: data received from the server
*/
socket.on('save_public_key_response', function(data) {
  if (data.result == 'ok') {
    addToChat("Public key successfully uploaded");
  } else {
    addToChat("Error: Can't upload public key:" + data.error);
  }
});

/*
** Upload the current user public key
** If the key doesn't exist locally, generate a priv/pub keypair and
** emit a message to the socket to save the public key on the server.
*/
function uploadKey() {
  fs.lstat('./.trustmsg/'+current_username+'/keys/pub.key', function(err, stats) {
    if (err || !stats.isFile()) {
      fs.mkdir('./.trustmsg/'+current_username+'/keys/', function(err) {
        addToChat("Generating public key");
        var pair = keypair();
        pair.private = pair.private.substring(0, pair.private.length - 1);
        pair.public = pair.public.substring(0, pair.public.length - 1);
        fs.writeFile('./.trustmsg/'+current_username+'/keys/priv.key', pair.private, function(err) {
          if (err && err.code != 'EEXIST') throw err;
          fs.writeFile('./.trustmsg/'+current_username+'/keys/pub.key', pair.public, function(err) {
            if (err && err.code != 'EEXIST') throw err;
            socket.emit('save_public_key', {
              key: pair.public
            })
          });
        });
      });
    }
  });
}

/*
** Handle key exchange received from the server
** Decrypt with the current user private key the common symmetric key
** sent by another user to communicate with him.
** Params:
**   - data: data received from the server
*/
socket.on('key_exchange_received', function(data) {
  var privkey = new NodeRSA(fs.readFileSync('./.trustmsg/'+current_username+'/keys/priv.key','utf8'), 'pkcs1-private-pem');
  data.key = privkey.decrypt(data.key, 'utf8');
  fs.writeFile('./.trustmsg/'+current_username+'/keys/'+data.usernameFrom+'.sym', data.key, function(err) {
    if (err && err.code != 'EEXIST') throw err;
    fs.writeFile('./.trustmsg/'+current_username+'/keys/'+data.usernameFrom+'.pub', data.senderPublicKey, function(err) {
      if (err && err.code != 'EEXIST') throw err;
    });
  });
});

/*
** Get key exchanges
** Emit a message to the socket to get the key exchanges on the server.
*/
function getKeyExchanges() {
  socket.emit('get_key_exchanges');
}

/*
** Send key exchange
** Check if the exchange key exist if not generate a random 256b key,
** Encrypt the key with the receiver public key and
** Emit a message to the socket to save the key exchange on the server.
** Params:
**   - usernameTo: the username of the receiver
*/
function sendKeyExchange(usernameTo) {
  var key = forge.random.getBytesSync(32);
  fs.writeFile('./.trustmsg/'+current_username+'/keys/'+usernameTo+'.sym', key, function(err) {
    if (err && err.code != 'EEXIST') throw err;
    var senderPublicKey = fs.readFileSync('./.trustmsg/'+current_username+'/keys/pub.key','utf8');
    var pubkey = new NodeRSA(fs.readFileSync('./.trustmsg/'+current_username+'/keys/'+usernameTo+'.pub','utf8'), 'pkcs1-public-pem');
    socket.emit('key_exchange', {
      'username': usernameTo,
      'senderPublicKey': senderPublicKey,
      'key': pubkey.encrypt(key, 'base64')
    });
  });
}

/*
** Handle get public key response from the server
** Save the public key of the user in a file.
** Params:
**   - data: data received from the server
*/
socket.on('get_public_key_response', function(data) {
  if (data.result == 'ok') {
    fs.mkdir('./.trustmsg/'+current_username+'/keys/', function(err) {
      fs.writeFile('./.trustmsg/'+current_username+'/keys/'+data.username+'.pub', data.key, function(err) {
        if (err && err.code != 'EEXIST') throw err;
        sendKeyExchange(data.username);
      });
    });
  } else {
    addToChat("Error: Can't get public key of " + data.username + ": " + data.error);
  }
})

/*
** Get public key
** Emit a message to the socket to get the public key of a user on the server.
** Params:
**   - username: the username
*/
function getPublicKey(username) {
  socket.emit('get_public_key', {
    username: username
  });
}

/*
** Prepare a message
** Extract receiver and the plaintext message from the command line.
** Cipher the plaintext with the symmetric key share with the receiver.
** Params:
**   - line: the command line
** Returns: the message
*/
function prepareMessage(line) {
  var msgRegexp = new RegExp("/msg\\s+(\\S+)\\s+(.*)");
  var match = msgRegexp.exec(line);
  if (match == null) {
    addToChat('Error: /msg: Bad format');
    return (undefined);
  } else {
    var key = fs.readFileSync('./.trustmsg/'+current_username+'/keys/'+match[1]+'.sym','utf8');
    if (!key) {
      addToChat("Error: Key not found");
    } else {
      var input = forge.util.createBuffer(match[2], 'utf8');
      var cipher = forge.cipher.createCipher('AES-CBC', key);
      cipher.start({iv: ''});
      cipher.update(input);
      cipher.finish();
      var ciphertext = cipher.output.getBytes();
      return ({
        username: match[1],
        message: ciphertext
      });
    }
  }
}

/*
** Prepare a message
** Extract group name and the plaintext message from the command line.
** Get the group id from the group name.
** Params:
**   - line: the command line
** Returns: the message
*/
function prepareGroupMessage(line) {
  var grpRegexp = new RegExp("/grpmsg\\s+(\\S+)\\s+(.*)");
  var match = grpRegexp.exec(line);
  if (match == null) {
    addToChat('Error: /msg: Bad format');
    return (undefined);
  } else {
    var groupID = getGroupID(match[1]);
    if (groupID == undefined)
      return (undefined);
    return ({
      groupID: groupID,
      groupName: match[1],
      message: match[2]
    });
  }
}

/*
** Handle message received from the server
** Call the function messageReceived.
*/
socket.on('message_received', messageReceived);

/*
** Handle send message response from the server
** Check if the message has been send correctly.
** Params:
**   - data: data received from the server
*/
socket.on('send_message_response', function(data) {
  if (data.result == 'ko') {
    addToChat("Error: Can't send message: " + data.error);
  }
});

/*
** Send a message
** Get the message from prepareMessage then emit the message to the socket.
** Params:
**   - line: The command line
*/
function sendMessage(line) {
  var msg = prepareMessage(line);
  if (msg != undefined) {
    var regexp = new RegExp("\\S+\\s+(\\S+)\\s+(.*)");
    var match = regexp.exec(line);
    socket.emit('send_message', msg);
    addToChat('<strong class="msg">me to ' + match[1] + ':</strong> ' + match[2]);
  }
}

/*
** Send a group message
** Get the message from prepareGroupMessage then emit the message to the socket.
** Params:
**   - line: The command line
*/
function sendGroupMessage(line) {
  var msg = prepareGroupMessage(line);
  if (msg != undefined) {
    var regexp = new RegExp("\\S+\\s+(\\S+)\\s+(.*)");
    var match = regexp.exec(line);
    socket.emit('send_message', msg);
    addToChat('<strong class="group-msg">me to ' + match[1] + ':</strong> ' + match[2]);
  }
}

/*
** Export a message
** Encrypt the message with the user public key then display the base64
** representation in the chat.
** Params:
**   - line: The command line
*/
function exportMessage(line) {
  var regexp = new RegExp("\\S+\\s+(\\S+)\\s+(.*)");
  var match = regexp.exec(line);
  if (match != null) {
    var user = match[1];
    var message = match[2];
    var pubkey = new NodeRSA(fs.readFileSync('./.trustmsg/'+current_username+'/keys/'+user+'.pub','utf8'), 'pkcs1-public-pem');
    if (pubkey) {
      addToChat("Encrypted message for " + user + ":<br/>" + pubkey.encrypt(message, 'base64'));
    } else {
      addToChat("Error: key not found for " + user);
    }
  } else {
    addToChat('Error: /exportmsg: Bad format');
  }
}

/*
** Decode a message
** Decrypt the message with the current user private key
** then display the plain text representation in the chat.
** Params:
**   - line: The command line
*/
function decodeMessage(line) {
  var regexp = new RegExp("\\S+\\s+(\\S+)\\s+(.*)");
  var match = regexp.exec(line);
  if (match != null) {
    var user = match[1];
    var message = match[2];
    var privkey = new NodeRSA(fs.readFileSync('./.trustmsg/'+current_username+'/keys/priv.key','utf8'), 'pkcs1-private-pem');
    addToChat("Decrypted message for " + user + ":<br/>" + privkey.decrypt(message, 'utf8'));
  } else {
    addToChat('Error: /decodemsg: Bad format');
  }
}

/*
** Handle get message response from the server
** Display pending user messages of the server.
** Params:
**   - data: data received from the server
*/
socket.on('get_messages_response', function(data) {
  if (data.result == 'ok') {
    data.messages.foreach(function(message) {
      messageReceived(message);
    });
  } else {
    addToChat("Error: Can't get messages : " + data.error);
  }
});

function getMessages() {
  socket.emit('get_messages');
}

/*
** Handle get status response from the server
** Display the status of the user received by the server.
** Params:
**   - data: data received from the server
*/
socket.on('get_status_response', function(data) {
  if (data.result == 'ok') {
    addToChat(data.username + ": " + data.status);
  } else {
    addToChat("Error: Can't get status of : " + data.error);
  }
});

function getStatus(username) {
  socket.emit('get_status', {
    username: username
  });
}

/*
** Handle the create group response from the server
** Check if the group has been created.
** Params:
**   - data: data received from the server
*/
socket.on('create_group_response', function(data) {
  if (data.result == 'ok') {
    fs.mkdir('./.trustmsg/'+current_username+'/groups', function(err) {
      fs.writeFile('./.trustmsg/'+current_username+'/groups/'+data.name+'.id', data.groupID, function(err) {
        if (err && err.code != 'EEXIST') throw err;
        addToChat("Group " + data.name + " successfully created");
      });
    });
  } else {
    addToChat("Error: Can't create the group " + data.name +": " + data.error);
  }
});

/*
** Create a group on the server
** Emit a create group message to the server.
** Params:
**   - name: the group name
*/
function createGroup(name) {
  var usernames = [];
  usernames.push(current_username)
  socket.emit('create_group', {
    name: name,
    usernames: usernames
  })
}

/*
** Handle add user to group response from the server
** Check if the user has been added to the group.
** Params:
**   - data: data received from the server
*/
socket.on('add_user_to_group_response', function(data) {
  if (data.result == 'ok') {
    addToChat(data.username + " added to " + data.groupName);
  } else {
    addToChat("Error: Can't add " + data.username + " to " + data.groupName + ": " + data.error);
  }
});

/*
** Add a user to a group on the server
** Emit an add user to group message to the server.
** Params:
**   - groupName: the group name
**   - username: the username
*/
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

/*
** Handle the remove user from group response from the server
** Check if the user has been removed from the server.
** Params:
**   - data: data received from the server
*/
socket.on('remove_user_from_group_response', function(data) {
  if (data.result == 'ok') {
    addToChat(data.username + " removed from " + data.groupName);
  } else {
    addToChat("Error: Can't remove " + data.username + " from " + data.groupName + ": " + data.error);
  }
});

/*
** Remove a user from a group on the server
** Emit a remove user from group message to the server.
** Params:
**   - groupName: the group name
**   - username: the username
*/
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

/*
** Handle the get group list response from the server.
** Display in the chat the group list received.
** Params:
**   - data: data received from the server
*/
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

/*
** Get group list
** Emit a message to the socket to get group list on the server
*/
function getGroupList() {
  socket.emit('get_group_list');
}

/*
** Handle the login response from the server
** Check if we are logged in.
** Upload the public key of the user.
** Get the pending messages.
** Params:
**   - data: data received from the server
*/
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

/*
** Get users in a group
** Emit a message to the socket to get users in the group
** Params:
**   - name: the group name
*/
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

/*
** Help
** Show trustmsg version and every commands in the chat
*/
function help() {
  addToChat("TrustMsg 0.0.1<br/>\
            /register username password<br/>\
            /login username password<br/>\
            Once logged in:<br/>\
            /addContact username<br/>\
            /msg user message<br/>\
            /grpmsg group message<br/>\
            /exportmsg user message<br/>\
            /decodemsg user message<br/>\
            /getStatus username<br/>\
            /createGroup name<br/>\
            /addUserToGroup groupName username<br/>\
            /removeUserFromGroup groupName username<br/>\
            /getGroupList<br/>\
            /getUsersInGroup name<br/>\
            message<br/>\
            /exit");
}

/*
** Exit
** Disconnect from the server and exit the process.
*/
function exit() {
  socket.emit('disconnect');
  addToChat('Disconnected');
  process.exit(0);
}

/*
** Handle input key press
** On Enter key, get the input line and parse the command.
** Params:
**   - e: window event
*/
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
        case '/addContact':
          getPublicKey(argv[1]);
          break;
        case '/msg':
          sendMessage(line);
          break;
        case '/grpmsg':
          sendGroupMessage(line);
          break;
        case '/exportmsg':
          exportMessage(line);
          break;
        case '/decodemsg':
          decodeMessage(line);
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

/*
** Main function
** Setup gui, trustmsg directory and the connected message
*/
function main() {
  window.frame = false;

  // This is a fix to get copy and paste working on Mac OSX
  var gui = require('nw.gui');
  if (process.platform === "darwin") {
    var mb = new gui.Menu({type: 'menubar'});
    mb.createMacBuiltin('RoboPaint', {
    hideEdit: false,
    });
    gui.Window.get().menu = mb;
  }

  fs.mkdir('./.trustmsg/', function(err) {
    if (err && err.code != 'EEXIST') throw err;
    socket.on('connect', function() {
      addToChat('Connected! please login or register first. For more details /help');
    });
  });
}

// call main function
main();
