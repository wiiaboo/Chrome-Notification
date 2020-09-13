// Copyright (c) 2015, Derek Guenther
// Copyright (c) 2020, Ricardo Constantino
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

const DEFAULT_OPTIONS = {
    api_key: '',
    update_interval: 15,
    notifications: false,
    notif_life: 5,
}
// console.log(`Opened Options page`);
function restore_options() {
    document.removeEventListener('DOMContentLoaded', restore_options, false);
    // console.log(`restore_options`);
    browser.storage.sync.get(DEFAULT_OPTIONS)
    .then(options => {
        // unitialized browser.storage.sync does NOT use default values
        if (options.api_key === null) Object.assign(options, DEFAULT_OPTIONS);
        setOptions(options);

        document.querySelector('#save').addEventListener('click', save_options);
        document.querySelector('#restore').addEventListener('click', restore_options);
        document.querySelector('#reset').addEventListener('click', clear_options);
        
        return browser.storage.local.set(options)
    });
}
function save_options() {
    browser.storage.local.set(readOptions())
    .then(() => browser.runtime.getBackgroundPage())
    .then(bg => bg.updateUser(true)
        .then(() => bg.getUser())
        .then(user => {
            if (user.last_response_status === 401) { show_status(`API Key is not valid!`); }
            else if (user.username) { show_status(`Your options have been saved. Thanks, ${user.username}!`); }
        }));
}
function clear_options() {
    browser.storage.local.clear();
    setOptions(DEFAULT_OPTIONS);
    show_status('Cleared settings.');
}

function setOptions(options) {
    // console.log(`setOptions:`, options)
    let { api_key, notifications, update_interval, notif_life } = options;
    document.querySelector('#api_key').value = api_key;
    document.querySelector(`#notifications input[value=${notifications || false}]`).checked = true;
    document.querySelector('#notif_life').value = notif_life;
    document.querySelector('#update_interval').value = update_interval;
}
function readOptions() {
    // console.log(`readOptions`)
    return {
        api_key: document.querySelector("#api_key")?.value,
        update_interval: parseInt(document.querySelector("#update_interval").value, 10),
        notif_life: parseInt(document.querySelector("#notif_life").value, 10),
        notifications:  document.querySelector('#notifications input:checked')?.value
    }
}

function show_status(status) {
    document.querySelector('#status').textContent = status;
    setTimeout(() => document.querySelector('#status').textContent = '', 5000);
}

document.addEventListener('DOMContentLoaded', restore_options, false);
