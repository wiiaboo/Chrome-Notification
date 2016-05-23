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
            chrome.runtime.getBackgroundPage().update_badge('!');
            // Also, notify the user.
            show_status('Sorry, that API key isn\'t valid. Please try again!');
        } else {
            // Store the api key in Chrome Sync.
            save_settings({"api_key": api_key}, function() {
                // Update status to let user know options were saved.
                show_status('Your options have been saved. Thanks, ' + String(json.user_information.username) + '!');
            });
        }
    };
    var url = WANIKANI_URL + "/api/" + API_VERSION + "/user/" + encodeURIComponent(api_key) + "/study-queue";
    xhr.open("GET", url);
    xhr.send();

    var notif_elem = document.querySelector("#notifications :checked");
    var update_elem = document.getElementById("update_interval");

    save_settings({
        "update_interval": parseInt(update_elem.value, 10),
        "notifications": notif_elem.value
    });

    chrome.runtime.getBackgroundPage().show_notification();
}

function save_settings(options, callback) {
    chrome.storage.local.set(options, function() {
        if (typeof callback === "function") {
            callback();
        }
        if (typeof chrome.storage.sync !== "undefined") {
            chrome.storage.sync.set(options);
        }
    });
}

// Restore all options to their form elements.
function restore_options() {
    document.removeEventListener('DOMContentLoaded', restore_options, false);
    if (typeof chrome.storage.sync !== "undefined") {
        chrome.storage.sync.get(["api_key", "update_interval", "notifications"], function(options) {
            if (options) {
                chrome.storage.local.set(options);
            }
        });
    }
    restore_notifications();
    restore_update_interval();
    restore_api_key();
    bind_save_and_reset();
}

// Restore API key text box.
function restore_api_key() {
    chrome.storage.local.get("api_key", function(data) {
        var api_key = data.api_key;
        var key_field = document.getElementById("api_key");
        if (api_key)
            key_field.value = api_key;
    });
}

// Restore notification radio buttons.
function restore_notifications() {
    chrome.storage.local.get("notifications", function(data) {
        var notifications = data.notifications;
        var notif_elem = document.getElementById("notifications");
        if (notifications)
            notif_elem.querySelector("input[value=" + notifications + "]").checked = true;
    });
};

// Restore update interval dropdown.
function restore_update_interval() {
    chrome.storage.local.get("update_interval", function(data) {
        var update_interval = data.update_interval;
        var updt_elem = document.getElementById("update_interval");
        if (update_interval)
            updt_elem.value = update_interval;
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
