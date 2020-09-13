// Copyright (c) 2015, Derek Guenther
// Copyright (c) 2020, Ricardo Constantino
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
const REFRESH_ALARM = 'refresh';

const WANIKANI_URL = 'https://www.wanikani.com';
const WANIKANI_API_BASE = 'https://api.wanikani.com/v2';
const WANIKANI_API_VERSION = '20170710';
const ALLOWED_RESOURCES = { USER: 'user', SUMMARY: 'summary' };
const MINIMUM_RESOURCE_COOLDOWN = 5 * 1000;
const SYNCED_ITEMS = ['api_key', 'notifications', 'update_interval', 'notif_life'];
const COMMON_CACHED_ITEMS = { data_requested_at: {}, data_received_at: {}, data_updated_at: {}, last_response_status: {}, etag: {} };
const RESOURCES_DEFAULTS = {
    user: { username: null, },
    summary: {
        reviews_available: 0,
        lessons_available: 0,
        next_reviews_at: null,
    }
}
const CONTEXT_MENUS = {
    refreshInformation: () => updateSummary(true),
    openOptions       : () => browser.runtime.openOptionsPage(),
    openHome          : () => browser.tabs.create({url: WANIKANI_URL}),
    startReview       : () => openPageOnce('WaniKani / Reviews', `${WANIKANI_URL}/review/session`),
    startLesson       : () => openPageOnce('WaniKani / Lessons', `${WANIKANI_URL}/lesson/session`),
};

function updateUser(force=false) {
    return requestData(ALLOWED_RESOURCES.USER, force);
}
function updateSummary(force=false) {
    return requestData(ALLOWED_RESOURCES.SUMMARY, force);
}
function getUser() {
    return getResource(ALLOWED_RESOURCES.USER);
}
function getSummary() {
    return getResource(ALLOWED_RESOURCES.SUMMARY);
}
function openPageOnce(title, url) {
    browser.tabs.query({ title }).then(tabs => { if (tabs.length < 1) browser.tabs.create({ url }); })
}

function setAlarm(when) {
    if (when) browser.alarms.create(REFRESH_ALARM, { when });
    else browser.storage.local.get({ update_interval: 15 })
        .then(config => browser.alarms.create(REFRESH_ALARM, { delayInMinutes: config.update_interval }))
    // browser.alarms.get(REFRESH_ALARM).then(alarm => alarm && console.log(`set alarm`, when, new Date(alarm.scheduledTime)));
}
function updateBadge() {
    return browser.storage.local.get()
    .then(data => {
        if (data.api_key == null || data.reviews_available == null) {
            browser.browserAction.setBadgeText({ text: '!' });
            browser.browserAction.setTitle({ title: browser.i18n.getMessage('enter_api_key') });
            return;
        }
        let text = data.reviews_available < 1 ? ''
            : data.reviews_available > 999 ? `${Math.floor(data.reviews_available / 1000)}K+`
            : data.reviews_available.toString(10);
        let title = null;
        if (data.next_reviews_at || data.lessons_available) {
            let nextReviewDate = new Date(data.next_reviews_at);
            if (data.next_reviews_at && nextReviewDate > Date.now() + 30000) {
                title = browser.i18n.getMessage('next_review', nextReviewDate.toLocaleString());
                setAlarm(nextReviewDate)
            } else if (data.next_reviews_at && data.reviews_available) {
                title = browser.i18n.getMessage('reviews_available_now', data.reviews_available);
                setAlarm();
            }
            if (data.lessons_available) {
                title += (title ? '\n' : '') + browser.i18n.getMessage('lessons_available_now', data.lessons_available);
            }
        }
        // console.log(`updateBadge:`, {text, title})
        browser.browserAction.setBadgeText({ text });
        browser.browserAction.setTitle({ title });
    })
}

function requestData(resource, force=false) {
    if (!Object.values(ALLOWED_RESOURCES).includes(resource)) return;
    return browser.storage.local.get(Object.assign({api_key: ''}, COMMON_CACHED_ITEMS))
    .then(({ data_requested_at, data_updated_at, data_received_at, last_response_status, etag, api_key }) => {
        if (!api_key) return;
        if (!force && data_requested_at[resource] && data_updated_at[resource] &&
            Date.now()-data_requested_at[resource] < MINIMUM_RESOURCE_COOLDOWN) return;
        let headers = new Headers({
            'Accept'           : 'application/json',
            'Authorization'    : `Bearer ${api_key}`,
            'Wanikani-Revision': WANIKANI_API_VERSION,
        });
        if (!force && etag[resource]) headers.set('If-None-Match', etag[resource]);
        data_requested_at[resource] = Date.now();
        let data = { data_requested_at, data_updated_at, data_received_at, last_response_status, etag };
        return fetch(new Request(`${WANIKANI_API_BASE}/${resource}`, { method: 'GET', headers, cache: 'no-cache' }))
        .then(response => {
            // console.log(`Completed request to ${resource}, status is ${response.status}`);
            data.data_received_at[resource] = Date.now();
            data.last_response_status[resource] = response.status;
            data.etag[resource] = response.headers.get('etag');
            if (response.status === 401) return;
            if (response.status === 429 || response.status === 304 || !response.ok) return;
            return response.json()
            .then(json => {
                if (json.url !== `${WANIKANI_API_BASE}/${resource}`)return;
                data.data_updated_at[resource] = json.data_updated_at;
                if (resource === ALLOWED_RESOURCES.SUMMARY) {
                    Object.assign(data, {
                        next_reviews_at:   json.data.next_reviews_at,
                        reviews_available: json.data.reviews.length && json.data.reviews[0].subject_ids.length,
                        lessons_available: json.data.lessons.length && json.data.lessons[0].subject_ids.length,
                    });
                } else if (resource === ALLOWED_RESOURCES.USER) {
                    Object.assign(data, { username: json.data.username })
                }
            })
        }).then(() => browser.storage.local.set(data))
    });
}
function getResource(resource) {
    if (!Object.values(ALLOWED_RESOURCES).includes(resource)) return {};
    return browser.storage.local.get(Object.assign({}, COMMON_CACHED_ITEMS, RESOURCES_DEFAULTS[resource]))
    .then(ret => { Object.keys(COMMON_CACHED_ITEMS).forEach(item => { ret[item] = ret[item][resource]; }); return ret; });
}

browser.browserAction.onClicked.addListener(() => {
    // console.log(`clicked button`);
    browser.storage.local.get(['api_key', 'reviews_available', 'lessons_available', 'last_response_status']).then(data => {
        if (!data.api_key || Object.values(data.last_response_status).some(status => status === 401)) CONTEXT_MENUS.openOptions();
        else if (!data.reviews_available && !data.lessons_available) CONTEXT_MENUS.openHome();
        else if (!data.reviews_available) CONTEXT_MENUS.startLesson();
        else CONTEXT_MENUS.startReview();
    });
});
browser.alarms.onAlarm.addListener((alarm) => {
    // console.log(`BRRRING, ${alarm.name}`);
    if (alarm.name === REFRESH_ALARM) updateSummary()
});
browser.storage.onChanged.addListener((changes, area) => {
    // console.log('storage changed', area, changes);
    if (area === 'sync') return;
    let changedItems = Object.keys(changes);
    for (let item of changedItems) {
        if (item === 'api_key') {
            updateUser()
            updateSummary()
        }
        if (item === 'update_interval')
            browser.alarms.get(REFRESH_ALARM).then(alarm => { if (alarm && alarm.periodInMinutes) setAlarm(); });
    }
    updateBadge();
    if (typeof browser.storage.sync === 'undefined') return;

    let itemsToSync = changedItems.filter(item => SYNCED_ITEMS.includes(item) &&
            changes[item].oldValue !== changes[item].newValue)
        .reduce((res, item) => { res[item] = changes[item].newValue; return res; }, {})
    if (Object.keys(itemsToSync).length < 1) return;
    // console.log('Updating', itemsToSync, 'in sync storage')
    browser.storage.sync.set(itemsToSync);
});
browser.contextMenus.onClicked.addListener(info => {
    if (!Object.keys(CONTEXT_MENUS).includes(info.menuItemId)) return;
    CONTEXT_MENUS[info.menuItemId]();
});
browser.runtime.onMessage.addListener((message, sender, respond) => {
    // console.log(`BG got message`, message, sender);
    if (message === 'update-summary')
        updateSummary(true);
    return true;
});

Object.keys(CONTEXT_MENUS).forEach(id =>
    browser.contextMenus.create({id, title: browser.i18n.getMessage(id), contexts: ['browser_action']}));
// browser.storage.local.get().then(data => console.log('Data on load:', data));
updateSummary(true)
