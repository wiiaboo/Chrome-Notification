// Copyright (c) 2015, Derek Guenther
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

const REFRESH_ALARM = 'refresh';
const storage = browser.storage.sync || browser.storage.local;

// Saves options to Chrome Sync.
function save_options() {
    let api_key = document.getElementById("api_key").value;
    let update_interval = parseInt(document.getElementById("update_interval").value, 10);
    let notif_life = parseInt(document.getElementById("notif_life").value, 10);
    let notifications = false;

    browser.alarms.clear(REFRESH_ALARM);

    storage.set({api_key, update_interval, notif_life, notifications})
    .then(() => browser.runtime.getBackgroundPage())
    .then(backgroundPage => {
        backgroundPage.getUserName().then(username => {
            show_status(`Your options have been saved. Thanks, ${username}!`);
        });
    });
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
    restore_number("notif_life");
    restore_number("update_interval");
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
        var notifications = data.notifications ? 'on' : 'off';
        var notif_elem = document.getElementById("notifications");
        if (notifications)
            notif_elem.querySelector(`input[value=${notifications}]`).checked = true;
    });
};

// Restore update interval dropdown.
function restore_number(name) {
    chrome.storage.local.get(name, function(data) {
        var value = data.hasOwnProperty(name) && data[name];
        var elem = document.getElementById(name);
        if (value && elem)
            elem.value = value;
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
