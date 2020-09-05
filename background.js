// Copyright (c) 2015, Derek Guenther
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

const REFRESH_ALARM = 'refresh';

const WANIKANI_URL = 'https://www.wanikani.com';
const WANIKANI_API_BASE = 'https://api.wanikani.com/v2';
const WANIKANI_API_VERSION = '20170710';
const ALLOWED_RESOURCES = {
    USER: 'user', // <2KB storage needed
    SUMMARY: 'summary', // ~10KB storage needed
};
const MINIMUM_RESOURCE_COOLDOWN = 5 * 1000;

const storage = browser.storage.sync || browser.storage.local;

// requestData (resource)
// use cached data if available: "If-Modified-Since: new Date(request.data_updated_at).toGMTString()"
// if 304, use cached data
// if 200, save request in cache and return to caller
// make a new request or handle no data change
function requestData(resource, force = false) {
    if (Object.values(ALLOWED_RESOURCES).indexOf(resource) < 0)
        throw new Error('Refused request to invalid resource.');

    return storage.get()
        .then(data => {
            // If the API key isn't set, we can't do anything
            if (!data.api_key) {
                update_title('string', 'Click here to enter your API key.');
                update_badge('!');
                return;
            }
            if (!data.cache)
                data.cache = {};

            if (!data.cache[resource])
                data.cache[resource] = {};

            let headers = new Headers({
                'Accept': 'application/json',
                'Authorization': `Bearer ${data.api_key}`,
                'Wanikani-Revision': WANIKANI_API_VERSION,
            });
            if (!force && data.cache[resource].lastRetrieved &&
                Date.now() - data.cache[resource].lastRetrieved < MINIMUM_RESOURCE_COOLDOWN) {
                return;
            } else if (!force && data.cache[resource].data_updated_at) {
                headers.set('If-Modified-Since',
                    new Date(data.cache[resource].data_updated_at).toUTCString());
            }

            let request = new Request(`${WANIKANI_API_BASE}/${resource}`, {
                method: 'GET',
                headers
            });

            return fetch(request)
                .then(response => {
                    let lastRetrieved = Date.now();
                    data.cache[resource].lastRetrieved = lastRetrieved;
                    if (response.status === 429) {
                        return;
                    }
                    if (response.status === 304) {
                        return;
                    }
                    return response.json()
                        .then(json => {
                            json.lastRetrieved = lastRetrieved;
                            data.cache[resource] = json;
                        });
                })
                .then(() => storage.set(data));
        })
        .then(() => storage.get());
}

function updateUser() {
    return requestData(ALLOWED_RESOURCES.USER);
}
function updateSummary(force) {
    return requestData(ALLOWED_RESOURCES.SUMMARY, force);
}
function getUserName() {
    return updateUser()
        .then(data => data.cache.user.data.username);
}
function getSummary() {
    return updateSummary()
        .then(data => data.cache.summary.data);
}

function fetchReviews(force=false) {
    updateSummary(force)
        .then(data => {
            let summary = data.cache.summary.data;
            setNextReview(new Date(summary.next_reviews_at));
            if (summary.reviews.length > 0) {
                setReviewCount(summary.reviews[0].subject_ids.length)
            } else {
                setReviewCount(0);
            }
            data.lessons_available = 0;
            if (summary.lessons.length > 0) {
                data.lessons_available = summary.lessons[0].subject_ids.length;
            }
            storage.set(data);
        });
}

function setNextReview(nextReviewDate) {
    update_title('date', nextReviewDate);
    if (nextReviewDate > new Date())
        setAlarm(nextReviewDate)
    else
        setRepeatingAlarm();
}

// Set the number of reviews available and notify the user.
function setReviewCount(reviews_available) {
    let capped = reviews_available > 999 ? `${Math.floor(reviews_available / 1000)}K+` : reviews_available;
    update_badge(capped);
    storage.set({reviews_available});
        // .then(() => show_notification());
}
function setRepeatingAlarm() {
    storage.get()
        .then(data => {
            let delayInMinutes = data['update_interval'] || 1;
            if (!data['update_interval']) {
                storage.set({update_interval: delayInMinutes});
            }
            browser.alarms.create(REFRESH_ALARM, { delayInMinutes });
        });
}
function setAlarm(when) {
    browser.alarms.create(REFRESH_ALARM, {when});
    browser.alarms.get(REFRESH_ALARM)
        .then(alarm => console.log(`Refreshing at: ${new Date(alarm.scheduledTime)}`))
}

// Update the badge text.
function update_badge(badgeText) {
    var newBadgeText = badgeText;
    if (!newBadgeText || newBadgeText === '0') {
        newBadgeText = '';
    }
    browser.browserAction.setBadgeText({ text: newBadgeText.toString() || '' });
}

// Update the extension's title with the next review time.
// 'type' can be either string or date
function update_title(type, content) {
    var titleString = '';
    if (type === 'date') {
        if (content > Date.now() + 30000) {
            var review_date = new Date(content).toLocaleString();
            titleString = chrome.i18n.getMessage('next_review', review_date);
        } else {
            titleString = chrome.i18n.getMessage('reviews_available_now');
        }
    } else if (type === 'string') {
        titleString = content;
    }
    browser.browserAction.setTitle({'title': titleString.toString() || '' });
}

// When the extension's icon is clicked:
browser.browserAction.onClicked.addListener(function() {
    // If no API key is saved, redirect to the options page. Else open a tab to WaniKani.
    storage.get().then(data => {
        let {api_key, reviews_available} = data;
        if (!api_key)
            browser.runtime.openOptionsPage();
        else if (!reviews_available)
            browser.tabs.create({url: WANIKANI_URL});
        else {
            browser.tabs.query({title: 'WaniKani / Reviews'})
                .then(tabs => {
                    if (!tabs.length)
                        browser.tabs.create({url:`${WANIKANI_URL}/review/session`});
                });
        }
    })
});

// When a "refresh" alarm goes off, fetch new data.
chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name === REFRESH_ALARM) {
        fetchReviews();
    }
});

browser.storage.onChanged.addListener(function(changes) {
    for (let key in changes) {
        if (changes.hasOwnProperty(key)) {
            if ((key === 'api_key' || key === 'update_interval') &&
                changes[key].oldValue !== changes[key].newValue) {
                fetchReviews(true);
            }
        }
    }
});

fetchReviews();
