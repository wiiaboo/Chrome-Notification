// Copyright (c) 2015, Derek Guenther
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0

var REFRESH_ALARM = 'refresh';
var API_VERSION = 'v1.4';
var WANIKANI_URL = 'https://www.wanikani.com';
var WANIKANI_API_V2 = 'https://api.wanikani.com/v2';
var storage = browser.storage.sync || browser.storage.local;

function timed_log(message) {
    if (false) {
        // note to reviewers: this should never run
        console.info("WN: " + message);
    }
}

// make a new request or handle no data change
function request_data(resource) {
    if (!resource) return;
    storage.get(["api_key", "last_requests", "reviews_available"], function(data) {
        if (!data.api_key) {
            // If the API key isn't set, we can't do anything
            update_title('string', 'Click here to enter your API key.');
            update_badge('!');
            return;
        }
        let xhr = new XMLHttpRequest();
        xhr.withCredentials = true;

        xhr.addEventListener("readystatechange", function () {
            if (this.readyState === 4) {
                storage.set({})
            }
        });

        xhr.open("GET", WANIKANI_API_V2 + "/" + resource);
        xhr.setRequestHeader("Authorization", ["Bearer", data.api_key].join(" "));

        xhr.send(data);
    });
}

// Pull new data from the API
function fetch_reviews(force=true) {
    storage.get(["api_key", "last_grab", "reviews_available"], function(data) {
        var api_key = data.api_key;
        var last_grab = data.last_grab;
        var reviews_available = data.reviews_available;
        var now = Date.now();
        if (!api_key) {
            // If the API key isn't set, we can't do anything
            update_title('string', 'Click here to enter your API key.');
            update_badge('!');
        } else if (force || !last_grab || now - last_grab >= 60000) {
            var xhr = new XMLHttpRequest();
            xhr.onload = function () {
                // Parse the JSON
                var json = xhr.responseText;
                json = JSON.parse(json);

                if (json.requested_information.vacation_date) {
                    set_vacation_date(json.requested_information.vacation_date);
                } else {
                    // Set the number of items that need reviewing
                    set_review_count(json.requested_information.reviews_available);

                    // Set the next review date
                    set_next_review(json.requested_information.next_review_date);

                    storage.set({
                        "lessons_available": json.requested_information.lessons_available,
                        "last_grab": now
                    });
                    timed_log("API request" + "\n" +
                              "\tNext review: " + new Date(json.requested_information.next_review_date * 1000).toLocaleString() + "\n" +
                              "\tReviews: " + json.requested_information.reviews_available + "\n" +
                              "\tlast_grab: " + new Date(now).toLocaleString());
                }
            };
            var url = WANIKANI_URL + "/api/" + API_VERSION + "/user/" + encodeURIComponent(api_key) + "/study-queue";
            xhr.open("GET", url);
            xhr.send();
        } else {
            set_repeating_alarm();
            if (reviews_available) {
                update_badge(reviews_available);
                update_title('date');
            }
        }
    });
}

function parse_wanikani_date(datetime) {
    // API v1.4 always returns seconds from epoch instead of milliseconds
    return datetime * 1000;
}

// Set the time of the next review.
function set_next_review(datetime) {
    var new_datetime = parse_wanikani_date(datetime);
    var now = Date.now();
    // floor "now" to second precision
    now = Math.floor(now / 1000) * 1000;
    // minimum time between API checks, only 100 requests per hour allowed
    //      should be forgiving enough for time desyncs between server and user
    var minimum_refresh = 30 * 1000;
    storage.set({'next_review': new_datetime}, function() {
        // Set the title of the extension
        update_title('date', new_datetime);
        timed_log("time dif: " + (new_datetime - now) + "ms");
        if (new_datetime > now + minimum_refresh) {
            // Refresh when it's time to study
            set_one_time_alarm(new_datetime);
        } else {
            set_repeating_alarm();
        }
    });
}

function set_vacation_date(datetime) {
    var new_datetime = parse_wanikani_date(datetime);
    storage.set({'vacation_date': new_datetime}, function() {
        // If vacation date is active, refresh on interval to see if it goes away
        if (new_datetime) {
            update_badge(0);
            update_title('string', 'Vacation mode is set');
            // Refresh at the specified interval.
            set_repeating_alarm();
        }
    });
}

// Set the number of reviews available and notify the user.
function set_review_count(newReviewCount) {
    storage.get('reviews_available', function(data) {
        var oldReviewCount = data.reviews_available;
        storage.set({"reviews_available": newReviewCount}, function() {
            update_badge(newReviewCount);
            if (newReviewCount > (oldReviewCount || 0)) {
                show_notification();
            }
        });
    });
}

function set_repeating_alarm() {
    storage.get('update_interval', function(data) {
        if (!data.update_interval) {
            storage.set({'update_interval': 1});
            data.update_interval = 1;
        }
        chrome.alarms.create(REFRESH_ALARM, {
            delayInMinutes: data.update_interval
        });
        timed_log('Refreshing in ' + data.update_interval + ' minute(s).');
    });
}

function set_one_time_alarm(time) {
    chrome.alarms.create(REFRESH_ALARM, {when: time} );
    chrome.alarms.get(REFRESH_ALARM, function(alarm) {
        var d = new Date(alarm.scheduledTime);
        timed_log('Refreshing at: ' + d);
    });
}

// If notifications are enabled, display a notification.
function show_notification(custom_message) {
    var title = chrome.i18n.getMessage('wanikaninotify_name');
    var message = custom_message || chrome.i18n.getMessage('reviews_notification');
    var type = (custom_message) ? "message" : "review";
    var opt = {
      type: "basic",
      title: title,
      message: message,
      iconUrl: "icons/icon_128.png"
    };
    storage.get(["notifications", "notif_life"], function(data) {
        var notif_life = data.notif_life;
        if (data.notifications === "on") {
            chrome.notifications.create(type, opt, function(id) {
                if (typeof notif_life === "number") {
                    chrome.alarms.create("notification", { when: Date.now() + notif_life*1000 });
                }
            })
        }
    });
}

// Update the badge text.
function update_badge(badgeText) {
    var newBadgeText = badgeText;
    if (!newBadgeText || newBadgeText === '0') {
        newBadgeText = '';
    }
    chrome.browserAction.setBadgeText({ text: newBadgeText.toString() || '' });
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
    chrome.browserAction.setTitle({'title': titleString.toString() || '' });
}

// Open the options page on install.
if (typeof chrome.runtime.onInstalled !== "undefined") {
    chrome.runtime.onInstalled.addListener(function (details) {
        if (details.reason === "install") {
            // chrome.runtime.openOptionsPage();
            browser.tabs.create({
                "url": chrome.runtime.getURL("options.html")
            });
        }
    });
}

// When the extension's icon is clicked:
chrome.browserAction.onClicked.addListener(function() {
    // If no API key is saved, redirect to the options page. Else open a tab to WaniKani.
    storage.get(["api_key", "reviews_available"], function(data) {
        var api_key = data.api_key;
        var reviews_available = data.reviews_available;
        if (!api_key) {
            // chrome.runtime.openOptionsPage();
            browser.tabs.create({
                "url": chrome.runtime.getURL("options.html")
            });
        } else if (!reviews_available || reviews_available === 0) {
            browser.tabs.create({url: WANIKANI_URL});
        } else if (!browser.tabs.query({'title': 'WaniKani / Reviews'})) {
            browser.tabs.create({url: WANIKANI_URL + "/review/session"});
        };
    });
});

if (typeof chrome.notifications.onClicked !== "undefined") {
    // When a notification is clicked:
    chrome.notifications.onClicked.addListener(function (notificationId) {
        if (notificationId === "review") {
            browser.tabs.create({url: WANIKANI_URL + "/review/session"});
        } else if (notificationId === "lesson") {
            browser.tabs.create({url: WANIKANI_URL + "/lesson/session"});
        } else {
            browser.tabs.create({url: WANIKANI_URL});
        }
        chrome.notifications.clear(notificationId);
        chrome.alarms.clear("notification");
    });
}

// When a "refresh" alarm goes off, fetch new data.
chrome.alarms.onAlarm.addListener(function(alarm) {
    if (alarm.name === REFRESH_ALARM) {
        fetch_reviews();
    } else if (alarm.name === "notification") {
        chrome.notifications.getAll(function(notifications) {
            for (let type of Object.keys(notifications)) {
                chrome.notifications.clear(type);
            }
        });
    }
});

// If the content page sends a message, update local data.
chrome.runtime.onMessage.addListener(function(request) {
    if (typeof request.reviews_available !== "undefined") {
        set_review_count(request.reviews_available);
        if (request.reviews_available === 0) {
            var wait_for_update = chrome.i18n.getMessage('wait_for_update');
            update_title('string', wait_for_update);
            // allow 10 seconds for remote server to update values
            set_one_time_alarm(Date.now() + 10000);
        }
    } else if (request.refresh === true) {
        set_one_time_alarm(Date.now() + 10000);
    }
});

chrome.storage.onChanged.addListener(function(changes) {
    for (let key in changes) {
        if (changes.hasOwnProperty(key)) {
            if (key === 'api_key') {
                fetch_reviews();
            }
        }
    }
});

timed_log("background.js fetch_reviews");
fetch_reviews(force=false);
