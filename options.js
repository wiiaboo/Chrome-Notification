// Copyright (c) 2015, Derek Guenther
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

var API_VERSION = 'v1.4';
var WANIKANI_URL = 'https://www.wanikani.com';

// Saves options to Chrome Sync.
function save_options() {
    var key_field = document.getElementById("api_key");
    var api_key = key_field.value;

    chrome.alarms.clear("refresh");

    // Test out the new api key.
    var xhr = new XMLHttpRequest();
    xhr.onload = function () {
        var json = xhr.responseText;
        json = JSON.parse(json);

        if (json.error) {
            // If there's an error, update the badge.
            chrome.extension.getBackgroundPage().update_badge('!');
            // Also, notify the user.
            show_status('Sorry, that API key isn\'t valid. Please try again!');
        } else {
            // Store the api key in Chrome Sync.
            chrome.storage.local.set({"api_key": api_key}, function() {
                // Update status to let user know options were saved.
                show_status('Your options have been saved. Thanks, ' + String(json.user_information.username) + '!');
            });
        }
    };
    var url = WANIKANI_URL + "/api/" + API_VERSION + "/user/" + encodeURIComponent(api_key) + "/study-queue";
    xhr.open("GET", url);
    xhr.send();

    // Save notification options.
    save_notifications();
    // Save update interval.
    save_update_interval();

    chrome.extension.getBackgroundPage().show_notification();
}

// Save update interval.
function save_update_interval() {
  var update_elem = document.getElementById("update_interval");
  chrome.storage.local.set({"update_interval":parseInt(update_elem.value, 10)});
}

// Save notification options.
function save_notifications() {
    var notif_elems = document.getElementsByName("notifications");
    for (var i = 0; i < notif_elems.length; i++) {
        if (notif_elems[i].type === "radio" && notif_elems[i].checked) {
            chrome.storage.local.set({"notifications":notif_elems[i].value});
            return;
        }
    }
}

// Restore all options to their form elements.
function restore_options() {
    document.removeEventListener('DOMContentLoaded', restore_options, false);
    restore_notifications();
    restore_update_interval();
    restore_api_key();
    bind_save_and_reset();
}

// Restore API key text box.
function restore_api_key() {
    chrome.storage.local.get("api_key", function(data) {
        var api_key = data.api_key;
        // If no API key is stored, leave the text box blank.
        // We don't set a default value for the API key because it must be set
        // for the extension to work.
        if (!api_key) {
            return;
        }
        var key_field = document.getElementById("api_key");
        key_field.value = api_key;
    });
}

// Restore notification radio buttons.
function restore_notifications() {
    chrome.storage.local.get("notifications", function(data) {
        var notifications = data.notifications;

        // If notifications hasn't been set yet, default it to off
        if (!notifications) {
            chrome.storage.local.set({"notifications": "off"}, function () {
                document.getElementById("notif_off").checked = true;
            });
        } else {
            if (notifications === "on") {
                document.getElementById("notif_on").checked = true;
            } else if (notifications === "off") {
                document.getElementById("notif_off").checked = true;
            }
        }
    });
};

// Restore update interval dropdown.
function restore_update_interval() {
    chrome.storage.local.get("update_interval", function(data) {
        if (!data.update_interval) {
            chrome.storage.local.set({"update_interval": 1});
            data.update_interval = 1;
        }
        var update_elem = document.getElementById("update_interval");
        update_elem.value = data.update_interval;
        return;
    });
}

function show_status(status) {
    var statusEl = document.getElementById('status');
    statusEl.textContent = status.toString();
    setTimeout(function() {
        statusEl.textContent = '';
    }, 4000);
}

function clear_options() {
    chrome.storage.local.clear();
    show_status('Cleared local storage!');
}

function bind_save_and_reset() {
    document.querySelector('#save').addEventListener('click', save_options);
    document.querySelector('#reset').addEventListener('click', clear_options);
}

document.addEventListener('DOMContentLoaded', restore_options, false);
