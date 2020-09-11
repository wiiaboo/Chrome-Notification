// Copyright (c) 2015, Derek Guenther
// Copyright (c) 2020, Ricardo Constantino
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

const REFRESH_ALARM = 'refresh';

const WANIKANI_URL = 'https://www.wanikani.com';
const WANIKANI_API_BASE = 'https://api.wanikani.com/v2';
const WANIKANI_API_VERSION = '20170710';
const ALLOWED_RESOURCES = {
    USER: 'user',
    SUMMARY: 'summary',
};
const MINIMUM_RESOURCE_COOLDOWN = 5 * 1000;
const SYNCED_ITEMS = ['api_key', 'notifications', 'update_interval', 'notif_life'];
const COMMON_CACHED_ITEMS = {
    data_requested_at: {},
    data_updated_at: {},
    last_response_status: {},
    etag: {}
};
const RESOURCES_DEFAULTS = {
    user: {
        username: null,
        current_vacation_started_at: null
    },
    summary: {
        reviews_available: 0,
        lessons_available: 0,
        next_reviews_at: null,
    }
}
const CONTEXT_MENUS = {
    openHome: openWanikaniHome,
    startReview: openReviewSession,
    startLesson: openLessonSession,
    refreshInformation: () => updateSummary(true),
    openOptions: openOptionsPage
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

function setAlarm(when) {
    if (when) browser.alarms.create(REFRESH_ALARM, { when });
    else browser.storage.local.get({ update_interval: 15 })
        .then(config => browser.alarms.create(REFRESH_ALARM, { delayInMinutes: config.update_interval }))
}

function updateBadge() {
    browser.storage.local.get(['api_key', 'reviews_available', 'next_reviews_at', 'lessons_available'])
    .then(data => {
        let { api_key, reviews_available, next_reviews_at, lessons_available } = data;

        let text = !api_key ? '!'
            : reviews_available < 1 ? ''
            : reviews_available > 999 ? `${Math.floor(reviews_available / 1000)}K+`
            : reviews_available.toString(10);
        let lines = [];
        if (!api_key) {
            lines.push(browser.i18n.getMessage('enter_api_key'));
        } else if (next_reviews_at || lessons_available) {
            let nextReviewDate = new Date(next_reviews_at);
            if (next_reviews_at && nextReviewDate > Date.now() + 30000) {
                lines.push(browser.i18n.getMessage('next_review', nextReviewDate.toLocaleString()));
                setAlarm(nextReviewDate)
            } else if (next_reviews_at && reviews_available) {
                lines.push(browser.i18n.getMessage('reviews_available_now', reviews_available));
                setAlarm();
            }
            if (lessons_available) {
                lines.push(browser.i18n.getMessage('lessons_available_now', lessons_available));
            }
        }
        let title = lines.join('\n');

        browser.browserAction.setBadgeText({ text });
        // console.log(`Set Button Badge to ${text}`);
        browser.browserAction.setTitle({ title: lines.join('\n') });
        // console.log(`Set Button Title to ${title}`);
    });
}

function requestData(resource, force=false) {
    if (!Object.values(ALLOWED_RESOURCES).includes(resource))
        return;

    return browser.storage.local.get(Object.assign({api_key: ''}, COMMON_CACHED_ITEMS))
    .then(config => {
        let { data_requested_at, data_updated_at, last_response_status, etag } = config;
        // If the API key isn't set, we can't do anything
        if (!config.api_key) {
            return;
        }
        if (!force && data_requested_at[resource] && data_updated_at[resource] &&
            Date.now() - data_requested_at[resource] < MINIMUM_RESOURCE_COOLDOWN) {
            return;
        }
        let headers = new Headers({
            'Accept': 'application/json',
            'Authorization': `Bearer ${config.api_key}`,
            'Wanikani-Revision': WANIKANI_API_VERSION,
        });
        if (!force && etag[resource]) {
            headers.set('If-None-Match', etag[resource]);
        }
        let request = new Request(`${WANIKANI_API_BASE}/${resource}`, { method: 'GET', headers });
        let data = { data_requested_at, data_updated_at, last_response_status, etag };
        return fetch(request).then(response => {
            // console.log(`Completed request to ${resource}, status is ${response.status}`);
            data.data_requested_at[resource] = Date.now();
            data.last_response_status[resource] = response.status;
            data.etag[resource] = response.headers.get('etag');
            if (response.status === 429) return;
            if (response.status === 304) return;
            if (response.status === 401) {
                data.api_key = '';
                return;
            }
            if (!response.ok) return;

            return response.json().then(json => fillDataWithUpdate(data, resource, json));
        }).then(() => browser.storage.local.set(data));
    });
}
function getResource(resource) {
    if (!Object.values(ALLOWED_RESOURCES).includes(resource)) return {};
    return browser.storage.local.get(Object.assign({}, COMMON_CACHED_ITEMS, RESOURCES_DEFAULTS[resource]))
    .then(ret => {
        Object.keys(COMMON_CACHED_ITEMS).forEach(item => { ret[item] = ret[item][resource]; })
        return ret;
    });
}

function fillDataWithUpdate(data, resource, json) {
    if (json == null || typeof json !== 'object') return;
    if (!Object.values(ALLOWED_RESOURCES).includes(resource)) return;
    if (json.url !== `${WANIKANI_API_BASE}/${resource}`)return;

    data.data_updated_at[resource] = new Date(json.data_updated_at).valueOf();

    switch (resource) {
        case ALLOWED_RESOURCES.SUMMARY:
            data.reviews_available = json.data.reviews.length > 0 ? json.data.reviews[0].subject_ids.length : 0;
            data.lessons_available = json.data.lessons.length > 0 ? json.data.lessons[0].subject_ids.length : 0;
            data.next_reviews_at = json.data.next_reviews_at;
            break;
        case ALLOWED_RESOURCES.USER:
            data.username = json.data.username;
            data.current_vacation_started_at = json.data.current_vacation_started_at;
            break;
    }
    // console.log('Filled data:', data);
}

function openOptionsPage() { browser.runtime.openOptionsPage(); }
function openWanikaniHome() { browser.tabs.create({url: WANIKANI_URL}); }
function openPageOnce(title, url) {
    browser.tabs.query({ title }).then(tabs => { if (tabs.length < 1) browser.tabs.create({ url }); })
}
function openReviewSession() { openPageOnce('WaniKani / Reviews', `${WANIKANI_URL}/review/session`); }
function openLessonSession() { openPageOnce('WaniKani / Lessons', `${WANIKANI_URL}/lesson/session`); }

browser.browserAction.onClicked.addListener(() => {
    // console.log(`clicked button`);
    browser.storage.local.get(['api_key', 'reviews_available', 'lessons_available']).then(data => {
        if (!data.api_key) openOptionsPage();
        else if (!data.reviews_available && !data.lessons_available) openWanikaniHome();
        else if (!data.reviews_available) openLessonSession();
        else openReviewSession();
    });
});
browser.alarms.onAlarm.addListener((alarm) => {
    // console.log(`BRRRING, ${alarm.name}`);
    if (alarm.name === REFRESH_ALARM) updateSummary()
});
browser.storage.onChanged.addListener((changes, area) => {
    // console.log('saveChangesToSync', area, changes);
    if (area === 'sync') return;
    let changedItems = Object.keys(changes);

    let updatedInfo = false;
    for (let item of changedItems) {
        if (changes[item].oldValue === changes[item].newValue) continue;
        switch (item) {
            case 'api_key':
                updateSummary(true);
                updateUser(true);
                updatedInfo = true;
                break;
            case 'next_reviews_at':
            case 'reviews_available':
            case 'lessons_available':
                updatedInfo = true;
                break;
            case 'update_interval':
                browser.alarms.get(REFRESH_ALARM).then(alarm => {
                    if (alarm && alarm.periodInMinutes) setAlarm();
                });
                break;
        }
    }
    if (updatedInfo) { updateBadge(); }

    if (typeof browser.storage.sync === 'undefined') return;

    let itemsToSync = changedItems
        .filter(changedItem => SYNCED_ITEMS.includes(changedItem) && changedItem.oldValue !== changedItem.newValue);
    if (itemsToSync.length < 1) return;

    // console.log(`Updating ${itemsToSync} in sync storage`)
    browser.storage.sync.set(itemsToSync.reduce((res, item) => {
        res[item] = changes[item].newValue;
        return res;
    }, {}));
});
browser.contextMenus.onClicked.addListener(info => {
    if (!Object.keys(CONTEXT_MENUS).includes(info.menuItemId)) return;
    CONTEXT_MENUS[info.menuItemId]();
})

Object.keys(CONTEXT_MENUS).forEach(menu =>
    browser.contextMenus.create({id: menu, title: browser.i18n.getMessage(menu), contexts: ['browser_action']})
);
// browser.storage.local.get().then(data => console.log('Data on start:\n', data));
updateBadge();
updateSummary(true);
