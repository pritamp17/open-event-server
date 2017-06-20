/**
 *
 * The Scheduler UI.
 * ================
 *
 * The scheduler supports two modes:
 * 1. Editable mode - The user can drag-drop and resize sessions
 * 2. Readonly mode - The sessions are displayed on the timeline, but cannot be edited.
 *
 * The Editable mode is turned on by default. To switch to Readonly mode, set the variable
 *      window.scheduler_readonly = true;
 * Before including this file.
 *
 * -@niranjan94
 */

/**
 *  TIME CONFIGURATION & MANIPULATION
 *  =================================
 *
 *  48px === 15 minutes
 *  (Smallest unit of measurement is 15 minutes)
 *
 */
var time = {
    start: {
        hours: 0,
        minutes: 0
    },
    end: {
        hours: 23,
        minutes: 59
    },
    unit: {
        minutes: 15,
        pixels: 48,
        minimum_duration: 5,
        count: 0
    },
    format: "YYYY-MM-DD HH:mm:ss"
};

window.dayLevelTime = {
    start: {
        hours: parseInt(time.start.hours),
        minutes: parseInt(time.start.minutes)
    },
    end: {
        hours: parseInt(time.end.hours),
        minutes: parseInt(time.end.minutes)
    }
};

//noinspection JSValidateTypes
/**
 * @type {{id: number, starts_at: moment.Moment, ends_at: moment.Moment}}
 */
window.mainEvent = {};


/**
 * Whether the scheduler is to be run in readonly mode or not.
 * @returns {boolean}
 */
function isReadOnly() {
    return !(_.isUndefined(window.scheduler_readonly) || _.isNull(window.scheduler_readonly) || window.scheduler_readonly !== true);
}

/**
 * Convert minutes to pixels based on the time unit configuration
 * @param {number} minutes The minutes that need to be converted to pixels
 * @param {boolean} [forTop=false] Indicate whether top header compensation needs to be done
 * @returns {number} The pixels
 */
function minutesToPixels(minutes, forTop) {
    minutes = Math.abs(minutes);
    if (forTop) {
        return ((minutes / time.unit.minutes) * time.unit.pixels) + time.unit.pixels;
    } else {
        return (minutes / time.unit.minutes) * time.unit.pixels;
    }
}

/**
 * Convert pixels to minutes based on the time unit configuration
 * @param {number} pixels The pixels that need to be converted to minutes
 * @param {boolean} [fromTop=false] Indicate whether top header compensation needs to be done
 * @returns {number} The minutes
 */
function pixelsToMinutes(pixels, fromTop) {
    pixels = Math.abs(pixels);
    if (fromTop) {
        return ((pixels - time.unit.pixels) / time.unit.pixels) * time.unit.minutes;
    } else {
        return (pixels / time.unit.pixels) * time.unit.minutes;
    }
}

/**
 * IN-MEMORY DATA STORES
 * =====================
 *
 * @type {Array}
 */
var days = [];
var tracks = [];
var sessionsStore = [];
var microlocationsStore = [];
var unscheduledStore = [];

/**
 * jQuery OBJECT REFERENCES
 * ========================
 *
 * @type {jQuery|HTMLElement}
 */
var $timeline = $("#timeline");
var $microlocations = $(".microlocation");
var $unscheduledSessionsList = $("#sessions-list");
var $microlocationsHolder = $("#microlocation-container");
var $unscheduledSessionsHolder = $unscheduledSessionsList;
var $noSessionsInfoBox = $("#no-sessions-info");
var $dayButtonsHolder = $("#date-change-btn-holder");
var $addMicrolocationForm = $('#add-microlocation-form');
var $timelineTable = $('table.timeline-table');
var $noSessionMessage = $('#no-session-message');

var $mobileTimeline = $("#mobile-timeline");
var $tracksTimeline = $("#tracks-timeline");
var $sessionViewHolder = $("#session-view-holder");
/**
 * TEMPLATE STRINGS
 * ================
 *
 * @type {string}
 */
var microlocationTemplate = $("#microlocation-template").html();
var sessionTemplate = $("#session-template").html();
var dayButtonTemplate = $("#date-change-button-template").html();

var mobileMicrolocationTemplate = $("#mobile-microlocation-template").html();
var mobileSessionTemplate = $("#mobile-session-template").html();
var mobileSpeakerTemplate = $("#mobile-speaker-template").html();
var mobileSpeakerElementTemplate = $("#mobile-speaker-image-template").html();
/**
 * Data Getters
 * ============
 *
 */

/**
 *
 * @param {int|Object|jQuery} sessionRef Can be session ID, or session object or an existing session element from the target
 * @param {jQuery} $searchTarget the target to search for the element
 * @returns {Object} Returns object with session element and session object
 */
function getSessionFromReference(sessionRef, $searchTarget) {
    var $sessionElement;
    var session;
    var newElement = false;
    if (sessionRef instanceof jQuery) {
        $sessionElement = sessionRef;
        session = $sessionElement.data("session");
    } else if (_.isObjectLike(sessionRef)) {
        $sessionElement = $searchTarget.find(".session[data-session-id=" + sessionRef.id + "]");
        // If it's a new session, create session element from template and initialize
        if ($sessionElement.length === 0) {
            $sessionElement = $(sessionTemplate);
            var content = sessionRef.title + " | ";
            var speakers = [];
            _.each(sessionRef.speakers, function(speaker) {
                speakers.push(speaker.name);
            });
            content += speakers.join(', ');
            $sessionElement.attr("data-session-id", sessionRef.id);
            $sessionElement.attr("data-original-text", content);
            $sessionElement.data("session", sessionRef);
            newElement = true;
        }
        session = sessionRef;
    } else if (_.isNumber(sessionRef)) {
        $sessionElement = $searchTarget.find(".session[data-session-id=" + sessionRef + "]");
        session = $sessionElement.data("session");
    } else {
        return false;
    }

    return {
        $sessionElement: $sessionElement,
        session: session,
        newElement: newElement
    };

}

/**
 * UI MANIPULATION METHODS
 * =======================
 *
 */

/**
 * Add a session to the timeline at the said position
 * @param {int|Object|jQuery} sessionRef Can be session ID, or session object or an existing session element from the unscheduled list
 * @param {Object} [position] Contains position information if the session is changed (microlocation-id and top)
 * @param {boolean} [shouldBroadcast=true]
 */
function addSessionToTimeline(sessionRef, position, shouldBroadcast) {
    var sessionRefObject;
    if (_.isUndefined(position)) {
        sessionRefObject = getSessionFromReference(sessionRef, $unscheduledSessionsHolder);
    } else {
        sessionRefObject = getSessionFromReference(sessionRef, $microlocationsHolder);
    }

    if (!sessionRefObject) {
        logError("addSessionToTimeline", sessionRef);
        return false;
    }

    if ((_.isNull(sessionRefObject.session.microlocation) || _.isNull(sessionRefObject.session.microlocation.id)) && isUndefinedOrNull(position)) {
        addSessionToUnscheduled(sessionRefObject.$sessionElement);
        return;
    }

    var oldMicrolocation = (_.isNull(sessionRefObject.session.microlocation) ? 0 : sessionRefObject.session.microlocation.id);
    var newMicrolocation = null;

    if (!isUndefinedOrNull(position)) {
        sessionRefObject.session.top = position.top;
        sessionRefObject.session.microlocation = {
            id: position.microlocation_id,
            name: position.microlocation_name
        };
        newMicrolocation = position.microlocation_id;
        sessionRefObject.session = updateSessionTime(sessionRefObject.$sessionElement);
        sessionRefObject.$sessionElement.data("session", sessionRefObject.session);
    } else {
        if (isUndefinedOrNull(shouldBroadcast) || shouldBroadcast) {
            sessionRefObject.session = updateSessionTime(sessionRefObject.$sessionElement);
        }
    }

    sessionRefObject.$sessionElement.css({
        "-webkit-transform": "",
        "transform": ""
    }).removeData("x").removeData("y");

    sessionRefObject.$sessionElement.removeClass("unscheduled").addClass("scheduled");

    delete  sessionRefObject.session.starts_at.isReset;
    delete  sessionRefObject.session.ends_at.isReset;

    sessionRefObject.$sessionElement.data("temp-top", sessionRefObject.session.top);
    sessionRefObject.$sessionElement.css("top", sessionRefObject.session.top + "px");
    sessionRefObject.$sessionElement.css("height", minutesToPixels(sessionRefObject.session.duration) + "px");
    $microlocationsHolder.find(".microlocation[data-microlocation-id=" + sessionRefObject.session.microlocation.id + "] > .microlocation-inner").append(sessionRefObject.$sessionElement);


    updateSessionTimeOnTooltip(sessionRefObject.$sessionElement);
    updateColor(sessionRefObject.$sessionElement, sessionRefObject.session.track);

    var $mobileSessionElement = $(mobileSessionTemplate);
    $mobileSessionElement.find('.time').text(sessionRefObject.session.starts_at.format('hh:mm A') + " - " + sessionRefObject.session.ends_at.format('hh:mm A'));
    $mobileSessionElement.find('.title').text(sessionRefObject.session.title);
    $mobileSessionElement.find('.session-track-details').attr("id", "session-track-details"+sessionRefObject.session.id);
    $mobileSessionElement.find('.event').attr("data-target", "#session-track-details"+sessionRefObject.session.id + ",#session-track-short-details"+sessionRefObject.session.id);
    $mobileSessionElement.find('.shorter-detail').attr("id", "session-track-short-details"+sessionRefObject.session.id);
    _.each(sessionRefObject.session.speakers, function(speaker) {
        var $mobileSpeakerElement = $(mobileSpeakerTemplate);
        var $mobileSpeakerImageElement = $(mobileSpeakerElementTemplate);
        if (speaker.small) {
            $mobileSpeakerImageElement.attr('src', speaker.small);
        } else {
            $mobileSpeakerImageElement.attr('src', speaker.photo);
        }
        $mobileSpeakerImageElement.attr('style', 'width:5rem;height:5rem;border-radius:50%;margin-right:10px;');
        if (speaker.thumbnail) {
            $mobileSpeakerElement.find('.speaker-big-photo').attr('src', speaker.thumbnail);
        } else {
            $mobileSpeakerElement.find('.speaker-big-photo').attr('src', speaker.photo);
        }
        $mobileSpeakerElement.find('.name').html(speaker.name);
        $mobileSpeakerElement.find('.organisation').html(speaker.organisation);
        $mobileSpeakerElement.find('.biography').html(speaker.short_biography);
        $mobileSessionElement.find('.speaker-more-detail').append($mobileSpeakerElement);
        $mobileSessionElement.find('.speaker-photo').append($mobileSpeakerImageElement);
        var speakerInfo = speaker.name;
        if(speaker.organisation) {
            speakerInfo = speakerInfo + " (" + speaker.organisation + ")";
        }
        speakerInfo = speakerInfo + ", ";
        $mobileSessionElement.find('.speaker-detail').append(speakerInfo);
    });
    $mobileSessionElement.find('.session-description').html(sessionRefObject.session.short_abstract);
    if(sessionRefObject.session.session_type) {
        $mobileSessionElement.find('.session-type').html(sessionRefObject.session.session_type.name);
    }
    $mobileSessionElement.find('.session-location').html(sessionRefObject.session.microlocation.name+'<i class="fa fa-map-marker fa-fw"></i>');
    updateColor($mobileSessionElement.find('.event'), sessionRefObject.session.track);
    $mobileTimeline.find(".mobile-microlocation[data-microlocation-id=" + sessionRefObject.session.microlocation.id + "] > .mobile-sessions-holder").append($mobileSessionElement);

    if(sessionRefObject.session.hasOwnProperty('track') && !_.isNull(sessionRefObject.session.track)) {
        $tracksTimeline.find(".mobile-microlocation[data-track-id=" + sessionRefObject.session.track.id + "] > .mobile-sessions-holder").append($mobileSessionElement.clone());
    }

    if (isUndefinedOrNull(shouldBroadcast) || shouldBroadcast) {
        if (!sessionRefObject.newElement) {
            $(document).trigger({
                type: "scheduling:change",
                session: sessionRefObject.session
            });
        }

        $(document).trigger({
            type: "scheduling:recount",
            microlocations: [oldMicrolocation, newMicrolocation]
        });
    }

    _.remove(unscheduledStore, function (sessionTemp) {
        return sessionTemp.id === sessionRefObject.session.id;
    });

    addInfoBox(sessionRefObject.$sessionElement, sessionRefObject.session);
    sessionRefObject.$sessionElement.ellipsis().ellipsis();
}

/**
 * Remove a session from the timeline and add it to the Unscheduled list or create a session element and add to Unscheduled list
 * @param {int|Object|jQuery} sessionRef Can be session ID, or session object or an existing session element from the timeline
 * @param {boolean} [isFiltering=false]
 * @param {boolean} [shouldBroadcast=true]
 */
function addSessionToUnscheduled(sessionRef, isFiltering, shouldBroadcast) {
    var session;

    var sessionRefObject = getSessionFromReference(sessionRef, $microlocationsHolder);
    if (!sessionRefObject) {
        logError("addSessionToUnscheduled", sessionRef);
        return false;
    }

    var oldMicrolocation = (_.isNull(sessionRefObject.session.microlocation) ? 0 : sessionRefObject.session.microlocation.id);

    sessionRefObject.session.top = null;
    sessionRefObject.session.duration = 30;
    sessionRefObject.session.starts_at.hours(0).minutes(0);
    sessionRefObject.session.ends_at.hours(0).minutes(0);
    sessionRefObject.session.microlocation = null;

    sessionRefObject.session.starts_at.isReset = true;
    sessionRefObject.session.ends_at.isReset = true;

    sessionRefObject.$sessionElement.data("session", sessionRefObject.session);
    $unscheduledSessionsHolder.append(sessionRefObject.$sessionElement);

    sessionRefObject.$sessionElement.addClass('unscheduled').removeClass('scheduled');
    resetTooltip(sessionRefObject.$sessionElement);
    sessionRefObject.$sessionElement.css({
        "-webkit-transform": "",
        "transform": "",
        "background-color": "",
        "height": "48px",
        "top": ""
    }).removeData("x").removeData("y");

    updateColor(sessionRefObject.$sessionElement, sessionRefObject.session.track);
    sessionRefObject.$sessionElement.ellipsis().ellipsis();
    $noSessionsInfoBox.hide();

    if (isUndefinedOrNull(isFiltering) || !isFiltering) {
        if (isUndefinedOrNull(shouldBroadcast) || shouldBroadcast) {
            if (!sessionRefObject.newElement) {
                $(document).trigger({
                    type: "scheduling:change",
                    session: sessionRefObject.session
                });
            }
            $(document).trigger({
                type: "scheduling:recount",
                microlocations: [oldMicrolocation]
            });
        }
        unscheduledStore.push(sessionRefObject.session);
    }

    try {
        setTimeout( function() {
            $('.session.unscheduled').popover('hide');
        }, 100);
    }
    catch(ignored) { }
}

/**
 * Update the counter badge that displays the number of sessions under each microlocation
 * @param {array} microlocationIds An array of microlocation IDs to recount
 */
function updateMicrolocationSessionsCounterBadges(microlocationIds) {
    _.each(microlocationIds, function (microlocationId) {
        var $microlocation = $microlocationsHolder.find(".microlocation[data-microlocation-id=" + microlocationId + "] > .microlocation-inner");
        var sessionsCount = $microlocation.find(".session.scheduled").length;
        $microlocation.find(".microlocation-header > .badge").text(sessionsCount);
    });
}

/**
 * Randomly generate and set a background color for an element
 * @param {jQuery} $element the element to be colored
 * @param [track]
 */
function updateColor($element, track) {
    if(!_.isUndefined(track)) {
        if(_.isNull(track)) {
            Math.seedrandom('null');
        } else {
            Math.seedrandom(track.name+track.id);
            if(!_.isNull(track.color) && !_.isEmpty(track.color)) {
                $element.css("background-color", track.color.trim());
                $element.css("background-color", track.color.trim());
                $element.css("color", track.font_color.trim());
                return;
            }
        }
    } else {
        Math.seedrandom();
    }

    $element.css("background-color", palette.random("800"));
    $element.css("background-color", palette.random("800"));
}

/**
 * Move any overlapping session to the unscheduled list. To be run as soon as timeline is initialized.
 */
function removeOverlaps() {
    var $sessionElements = $microlocationsHolder.find(".session.scheduled");
    _.each($sessionElements, function ($sessionElement) {
        $sessionElement = $($sessionElement);
        var isColliding = isSessionOverlapping($sessionElement);
        if (isColliding) {
            addSessionToUnscheduled($sessionElement);
        }
    });
}

/**
 * Check if a session is overlapping any other session
 * @param {jQuery} $session The session
 * @param {jQuery} [$microlocation] The microlocation to search in
 * @returns {boolean|jQuery} If no overlap, return false. If overlaps, return the session that's beneath.
 */
function isSessionOverlapping($session, $microlocation) {
    if (isUndefinedOrNull($microlocation)) {
        $microlocation = $session.parent();
    }
    var $otherSessions = $microlocation.find(".session.scheduled");
    var returnVal = false;
    _.each($otherSessions, function ($otherSession) {
        $otherSession = $($otherSession);
        if (!$otherSession.is($session) && collision($otherSession, $session)) {
            returnVal = $otherSession;
        }
    });
    return returnVal;
}

/**
 * Check if the session is within the timeline
 * @param {jQuery} $sessionElement the session element to check
 * @returns {boolean} Return true, if outside the boundary. Else, false.
 */
function isSessionRestricted($sessionElement) {
    return !horizontallyBound($microlocations, $sessionElement, 0);
}

/**
 * Check if the session element is over the timeline
 * @param {jQuery} $sessionElement the session element to check
 * @returns {boolean}
 */
function isSessionOverTimeline($sessionElement) {
    try {
        return collision($microlocations, $sessionElement);
    } catch (e) {
        return false;
    }
}

/**
 * Update the session's time on it's tooltip and display it.
 * @param {jQuery} $sessionElement the target session element
 */
function updateSessionTimeOnTooltip($sessionElement) {
    var topTime = moment.utc({hour: dayLevelTime.start.hours, minute: dayLevelTime.start.minutes});
    var mins = pixelsToMinutes($sessionElement.outerHeight(false));
    var topInterval = pixelsToMinutes($sessionElement.data("temp-top"), true);

    var startTimeString = topTime.add(topInterval, 'm').format("LT");
    var endTimeString = topTime.add(mins, "m").format("LT");

    $sessionElement.tooltip('destroy').tooltip({
        placement : 'top',
        title : startTimeString + " to " + endTimeString
    });
    $sessionElement.tooltip("show");
}

/**
 * Clear a tooltip on a session element.
 * @param {jQuery} $sessionElement the target session element
 */
function resetTooltip($sessionElement) {
    $sessionElement.tooltip("hide").tooltip({
        placement : 'top',
        title : ""
    });
}

/**
 * Update the session time and store to the session object
 * @param {jQuery} $sessionElement The session element to update
 * @param {object} [session] the session object to work on
 * @returns {*}
 */
function updateSessionTime($sessionElement, session) {

    var saveSession = false;
    if (_.isUndefined(session)) {
        session = $sessionElement.data("session");
        saveSession = true;
    }

    var day = session.starts_at.format("Do MMMM YYYY");
    var dayIndex = _.indexOf(days, day);

    var selectedDate = moment($('.date-change-btn.active').text(), "Do MMMM YYYY");
    var topTime = moment.utc({hour: dayLevelTime.start.hours, minute: dayLevelTime.start.minutes});
    var mins = pixelsToMinutes($sessionElement.outerHeight(false));
    var topInterval = pixelsToMinutes($sessionElement.data("temp-top"), true);

    var newStartTime = _.cloneDeep(topTime.add(topInterval, 'm'));
    var newEndTime = topTime.add(mins, "m");

    session.duration = mins;
    session.starts_at.date(selectedDate.date());
    session.starts_at.month(selectedDate.month());
    session.starts_at.year(selectedDate.year());
    session.starts_at.hours(newStartTime.hours());
    session.starts_at.minutes(newStartTime.minutes());

    session.ends_at.date(selectedDate.date());
    session.ends_at.month(selectedDate.month());
    session.ends_at.year(selectedDate.year());
    session.ends_at.hours(newEndTime.hours());
    session.ends_at.minutes(newEndTime.minutes());

    _.each(sessionsStore[dayIndex], function (stored_session) {
        if (stored_session.id === session.id) {
            var index = sessionsStore[dayIndex].indexOf(session);
            if (index > -1) {
                sessionsStore[dayIndex].splice(index, 1);
            }
            var dayString = session.starts_at.format("Do MMMM YYYY");

            var dayIndex1 = _.indexOf(days, dayString);
            if (_.isArray(sessionsStore[dayIndex1])) {
                sessionsStore[dayIndex1].push(session);
            } else {
                sessionsStore[dayIndex1] = [session];
            }
        }
    });

    if (saveSession) {
        $sessionElement.data("session", session);
    }

    return session;
}

/**
 * Add info Box to the session element
 * @param {jQuery} $sessionElement The session element to update
 * @param {object} [session] the session object to work on
 */
function addInfoBox($sessionElement, session) {
    if(isReadOnly()) {
        $sessionElement.css('cursor', 'pointer');
    }
    var content = "";
    if(!_.isNull(session.short_abstract)) {
        content +=  "<strong>About the session:</strong> " + session.short_abstract + "<br>";
    } else {
        session.long_abstract  = session.long_abstract.substr(0, 100);
        content +=  "<strong>About the session:</strong> " + session.long_abstract + "<br>";
    }
    _.forEach(session.speakers, function(speaker, index) {
        if(session.speakers.length === 1) {
            content += "<strong>Speaker: </strong> " + speaker.name + "<br>";
        } else {
            content += "<strong>Speaker </strong> " + (parseInt(index, 10)+1) + "<strong> :</strong> " + speaker.name + "<br>";
        }
        if(speaker.short_biography) {
            content += "<strong>About the Speaker: </strong><br>" + speaker.short_biography + "<br>";
        } else {
            session.speakers.long_biography = speaker.long_biography.substr(1, 100);
            content += "<strong>About the Speaker: </strong><br>" + speaker.long_biography + "<br>";
        }
    });
    if(!_.isNull(session.starts_at)) {
        content += "<strong>Start Time:</strong> " + session.starts_at.format("HH:mm:ss") + "<br>";
    }
    if(!_.isNull(session.ends_at)) {
        content += "<strong>End Time:</strong> " + session.ends_at.format("HH:mm:ss") + "<br>";
    }
    if(!_.isNull(session.track)) {
        content += "<strong>Track:</strong> " + session.track.name + "<br>";
    }
    if(!_.isNull(session.microlocation)) {
        content += "<strong>Room:</strong> " + session.microlocation.name + "<br>";
    }

    $sessionElement.popover({
        trigger: 'manual',
        placement: 'bottom',
        html: true,
        title: session.title,
        content: content,
        container: '.scheduler-body'
    });
}


/**
 * Add a new microlocation to the timeline
 * @param {object} microlocation The microlocation object containing the details of the microlocation
 */
function addMicrolocationToTimeline(microlocation) {
    var $microlocationElement = $(microlocationTemplate);
    $microlocationElement.attr("data-microlocation-id", microlocation.id);
    $microlocationElement.attr("data-microlocation-name", microlocation.name);
    $microlocationElement.find(".microlocation-header").html(microlocation.name);
    $microlocationElement.find(".microlocation-inner").css("height", time.unit.count * time.unit.pixels + "px");
    $microlocationsHolder.append($microlocationElement);

    var $mobileMicrolocationElement = $(mobileMicrolocationTemplate);
    $mobileMicrolocationElement.find('.name').text(microlocation.name);
    $mobileMicrolocationElement.attr("data-microlocation-id", microlocation.id);
    $mobileTimeline.append($mobileMicrolocationElement);
}

/**
 * Generate timeunits for the timeline
 */
function generateTimeUnits() {
    var start = moment.utc().hour(window.dayLevelTime.start.hours).minute(window.dayLevelTime.start.minutes).second(0);
    var end = moment.utc().hour(window.dayLevelTime.end.hours).minute(window.dayLevelTime.end.minutes).second(0);
    var $timeUnitsHolder = $(".timeunits");
    $timeUnitsHolder.html('<div class="timeunit"></div>');
    var timeUnitsCount = 1;
    while (start <= end) {
        var timeUnitDiv = $("<div class='timeunit'>" + start.format('HH:mm') + "</div>");
        $timeUnitsHolder.append(timeUnitDiv);
        start.add(time.unit.minutes, 'minutes');
        timeUnitsCount++;
    }
    $microlocationsHolder.css("height", timeUnitsCount * time.unit.pixels);
    time.unit.count = timeUnitsCount;
}

/**
 *
 *
 *
 */

/**
 * Initialize all the interactables necessary (drag-drop and resize)
 */
function initializeInteractables() {

    $microlocations = $microlocationsHolder.find(".microlocation");

    interact(".session")
        .draggable({
            // enable inertial throwing
            inertia: false,
            // enable autoScroll
            autoScroll: {
                margin: 50,
                distance: 5,
                interval: 10
            },
            restrict: {
                restriction: ".draggable-holder"
            },
            // call this function on every dragmove event
            onmove: function (event) {
                var $sessionElement = $(event.target),
                    x = (parseFloat($sessionElement.data('x')) || 0) + event.dx,
                    y = (parseFloat($sessionElement.data('y')) || 0) + event.dy;

                $sessionElement.css("-webkit-transform", "translate(" + x + "px, " + y + "px)");
                $sessionElement.css("transform", "translate(" + x + "px, " + y + "px)");

                $sessionElement.data('x', x);
                $sessionElement.data('y', y);

                $sessionElement.data("temp-top", roundOffToMultiple($sessionElement.offset().top - $(".microlocations.x1").offset().top));

                if (isSessionOverTimeline($sessionElement)) {
                    updateSessionTimeOnTooltip($sessionElement);
                } else {
                    resetTooltip($sessionElement);
                }

            },
            // call this function on every dragend event
            onend: function (event) {

            }
        });


    interact(".session")
        .resizable({
            preserveAspectRatio: false,
            enabled: true,
            edges: {left: false, right: false, bottom: true, top: false}
        })
        .on("resizemove", function (event) {
            if ($(event.target).hasClass("scheduled")) {
                var target = event.target,
                    x = (parseFloat(target.getAttribute("data-x")) || 0),
                    y = (parseFloat(target.getAttribute("data-y")) || 0);
                if(roundOffToMultiple(event.rect.height) < minutesToPixels(time.unit.minimum_duration)) {
                    target.style.height = minutesToPixels(time.unit.minimum_duration) + "px";
                } else {
                    target.style.height = roundOffToMultiple(event.rect.height) + "px";
                }

                $(event.target).ellipsis();
                updateSessionTimeOnTooltip($(event.target));
            }
        })
        .on("resizeend", function (event) {
            if ($(event.target).hasClass("scheduled")) {
                var $sessionElement = $(event.target);
                $(document).trigger({
                    type: "scheduling:change",
                    session: updateSessionTime($sessionElement)
                });

            }
        });

    interact(".microlocation-inner").dropzone({
        // only accept elements matching this CSS selector
        accept: ".session",
        // Require a 75% element overlap for a drop to be possible
        overlap: 0.50,

        ondropactivate: function (event) {
            $(event.target).addClass("drop-active");
        },
        ondragenter: function (event) {
            $(event.target).addClass("drop-now");
        },
        ondragleave: function (event) {
            $(event.target).removeClass("drop-now");
        },
        ondrop: function (event) {
            var $sessionElement = $(event.relatedTarget);
            var $microlocationDropZone = $(event.target);

            $microlocationDropZone.removeClass("drop-active").removeClass("drop-now");

            addSessionToTimeline($sessionElement, {
                microlocation_id: parseInt($microlocationDropZone.parent().attr("data-microlocation-id")),
                microlocation_name: $microlocationDropZone.parent().attr("data-microlocation-name"),
                top: $sessionElement.data("temp-top")
            });

            var isColliding = isSessionOverlapping($sessionElement, $microlocationDropZone);
            if (!isColliding) {
                updateSessionTime($sessionElement);
            } else {
                createSnackbar("Session cannot be dropped onto another sessions.", "Try Again");
                addSessionToUnscheduled($sessionElement);
            }

        },
        ondropdeactivate: function (event) {
            var $microlocationDropZone = $(event.target);
            var $sessionElement = $(event.relatedTarget);
            $microlocationDropZone.removeClass("drop-now").removeClass("drop-active");
            if (!$sessionElement.hasClass("scheduled")) {
                $sessionElement.css({
                    "-webkit-transform": "",
                    "transform": "",
                    "background-color": ""
                }).removeData("x").removeData("y");
                resetTooltip($sessionElement);
            }
        }
    });
}

/**
 * This callback called after sessions and microlocations are processed.
 * @callback postProcessCallback
 */
/**
 * Process the microlocations and sessions data loaded from the server into in-memory data stores
 * @param {object} microlocations The microlocations json object
 * @param {object} sessions The sessions json object
 * @param {postProcessCallback} callback The post-process callback
 */
function processMicrolocationSession(microlocations, sessions, callback) {

    _.each(sessions, function (session) {
        if (session.state === 'accepted' || session.state === 'confirmed') {

            session = _.cloneDeep(session);

            var startTime = moment.utc(session.starts_at);
            var endTime = moment.utc(session.ends_at);

            if (startTime.isSame(mainEvent.starts_at, "day")) {
                window.dayLevelTime.start.hours = mainEvent.starts_at.hours();
                window.dayLevelTime.start.minutes = mainEvent.starts_at.minutes();
            }

            var topTime = moment.utc({hour: dayLevelTime.start.hours, minute: dayLevelTime.start.minutes});

            var duration = moment.duration(endTime.diff(startTime));

            var top = minutesToPixels(moment.duration(moment.utc({
                hour: startTime.hours(),
                minute: startTime.minutes()
            }).diff(topTime)).asMinutes(), true);

            var now = window.mainEvent.starts_at;
            var end = window.mainEvent.ends_at;
            while(now.format('M/D/YYYY') <= end.format('M/D/YYYY')) {
                days.push(now.format("Do MMMM YYYY"));
                now.add('days', 1);
            }

            var dayString = startTime.format("Do MMMM YYYY"); // formatted as eg. 2nd May 2013

            if (!_.includes(days, dayString)) {
                days.push(dayString);
            }

            if(session.hasOwnProperty('track') && !_.isNull(session.track)) {
                if (!_.some(tracks, session.track)) {
                   tracks.push(session.track);
               }
            }

            session.starts_at = startTime;
            session.ends_at = endTime;
            session.duration = Math.abs(duration.asMinutes());
            session.top = top;

            var dayIndex = _.indexOf(days, dayString);
            if (_.isArray(sessionsStore[dayIndex])) {
                sessionsStore[dayIndex].push(session);
            } else {
                sessionsStore[dayIndex] = [session];
            }

            for (var index in days) {
                if (_.isArray(unscheduledStore[index])) {
                    unscheduledStore[index].push(session);
                } else {
                    unscheduledStore[index] = [session];
                }
            }
        }
    });

    _.each(microlocations, function (microlocation) {
        if (!_.includes(microlocationsStore, microlocation)) {
            microlocationsStore.push(microlocation);
        }
    });

    microlocationsStore = _.sortBy(microlocationsStore, "name");
    loadDateButtons();
    callback();
}

/**
 * Load the date selection button onto the DOM
 */
function loadDateButtons() {
    var sortedDays = days.sort();
    _.each(sortedDays, function (day, index) {
        var $dayButton = $(dayButtonTemplate);
        if (index === 0) {
            $dayButton.addClass("active");
        }
        $dayButton.text(day);
        $dayButtonsHolder.append($dayButton);
    });
    loadMicrolocationsToTimeline(sortedDays[0]);
}

/**
 * Load all the sessions of a given day into the timeline
 * @param {string} day
 */
function loadMicrolocationsToTimeline(day) {

    $timelineTable.show();
    $noSessionMessage.hide();
    $microlocationsHolder.find(".microlocation").show();

    var parsedDay = moment.utc(day, "Do MMMM YYYY");
    if (parsedDay.isSame(mainEvent.starts_at, "day")) {
        window.dayLevelTime.start.hours = mainEvent.starts_at.hours();
        window.dayLevelTime.start.minutes = mainEvent.starts_at.minutes();
    }
    if (parsedDay.isSame(mainEvent.ends_at, "day")) {
        window.dayLevelTime.end.hours = mainEvent.ends_at.hours();
        window.dayLevelTime.end.minutes = mainEvent.ends_at.minutes();
    }

    var least_hours = 24;
    var max_hours = 0;
    var max_minutes = 0;
    var dayIndex = _.indexOf(days, day);

    if (isReadOnly()) {
        _.each(sessionsStore[dayIndex], function (session) {
            // Add session elements, but do not broadcast.
            if (!_.isNull(session.top) && !_.isNull(session.microlocation) && !_.isNull(session.microlocation.id) && !_.isNull(session.starts_at) && !_.isNull(session.ends_at) && !session.hasOwnProperty("isReset")) {
                if (session.starts_at.hours() < least_hours) {
                    least_hours = session.starts_at.hours();
                }
                if (session.ends_at.hours() > max_hours) {
                    max_hours= session.ends_at.hours();
                    if (session.ends_at.minutes() > max_minutes) {
                        max_minutes = session.ends_at.minutes();
                    }
                }
            }
        });

        if (max_hours === 0) {
            $timelineTable.hide();
            $noSessionMessage.show();
        }

        window.dayLevelTime.start.hours = least_hours;
        window.dayLevelTime.start.minutes = 0;
        window.dayLevelTime.end.hours = max_hours + ~~((max_minutes + 15) / 60);
        window.dayLevelTime.end.minutes = (max_minutes + 15) % 60;

        var topTime = moment.utc({hour: dayLevelTime.start.hours, minute: dayLevelTime.start.minutes});

        _.each(sessionsStore[dayIndex], function (session) {
            var top = minutesToPixels(moment.duration(moment.utc({
                    hour: session.starts_at.hours(),
                    minute: session.starts_at.minutes()
                }).diff(topTime)).asMinutes(), true);

            session.top = top;
        });
    }

    generateTimeUnits();

    $microlocationsHolder.empty();
    $unscheduledSessionsHolder.empty();
    $mobileTimeline.empty();
    $noSessionsInfoBox.show();

    _.each(microlocationsStore, addMicrolocationToTimeline);

    $tracksTimeline.html("");
    _.each(tracks, function (track) {
        if(!_.isNull(track)) {
            var $trackElement = $(mobileMicrolocationTemplate);
            $trackElement.find('.name').text(track.name);
            $trackElement.attr("data-track-id", track.id);
            $trackElement.attr("id", "track-id-"+track.id);
            $tracksTimeline.append($trackElement);
        }
    });

    sessionsStore[dayIndex] = _.sortBy(sessionsStore[dayIndex], "starts_at");

    _.each(sessionsStore[dayIndex], function (session) {
        // Add session elements, but do not broadcast.
        if (!_.isNull(session.top) && !_.isNull(session.microlocation) && !_.isNull(session.microlocation.id) && !_.isNull(session.starts_at) && !_.isNull(session.ends_at) && !session.hasOwnProperty("isReset")) {
            addSessionToTimeline(session, null, false);
        }
    });

    _.each(unscheduledStore[dayIndex], function (session) {
        // Add session elements, but do not broadcast.

        if (!_.isNull(session.top) && !_.isNull(session.microlocation) && !_.isNull(session.microlocation.id) && !_.isNull(session.starts_at) && !_.isNull(session.ends_at) && !session.hasOwnProperty("isReset")) {
            return true;
        } else {
            if (!isReadOnly()) {
                addSessionToUnscheduled(session, false, false);
            }
        }
    });

    _.each($mobileTimeline.find('.mobile-microlocation'), function ($mobileMicrolocation) {
        $mobileMicrolocation = $($mobileMicrolocation);
        if ($mobileMicrolocation.find(".mobile-sessions-holder").children().length === 0) {
            $mobileMicrolocation.remove();
        }
    });

    _.each($tracksTimeline.find('.mobile-microlocation'), function ($mobileMicrolocation) {
        $mobileMicrolocation = $($mobileMicrolocation);
        if ($mobileMicrolocation.find(".mobile-sessions-holder").children().length === 0) {
            $mobileMicrolocation.remove();
        }
    });

    $microlocations = $microlocationsHolder.find(".microlocation");
    $("[data-toggle=tooltip]").tooltip("hide");

    if (isReadOnly()) {
        _.each($microlocations, function ($microlocation) {
            $microlocation = $($microlocation);
            if ($microlocation.find('.microlocation-inner').children().length === 0) {
                $microlocation.hide();
            }
        });
        $('.edit-btn').hide();
        $('.remove-btn').hide();
    }
}

function loadData(eventId, callback) {
    api.microlocations.get_microlocation_list({event_id: eventId}, function (microlocationsData) {
        api.sessions.get_session_list({event_id: eventId}, function (sessionData) {
            processMicrolocationSession(microlocationsData.obj, sessionData.obj, callback);
        });
    });
}

/**
 * Initialize the timeline for a given event
 * @param {int} eventId The event ID
 */
function initializeTimeline(eventId) {
    initializeSwaggerClient(function () {
        loadData(eventId, function () {
            $(".flash-message-holder").hide();
            $(".scheduler-holder").show();
            $(".session").ellipsis();
            if (!isReadOnly()) {
                initializeInteractables();
            } else {
                $('.edit-btn').hide();
                $('.remove-btn').hide();
            }
            $(".rooms-view").addClass('active');
            var max_width = $("#timeline").width() - $(".timeunits.x1").width();
            $('.microlocation-container').css("max-width", max_width + "px");

            $(document).trigger({
                type: "scheduling:recount",
                microlocations: _.map(microlocationsStore, 'id')
            });
        });
    });
}
/**
 * FUNCTIONS THAT ARE TRIGGERED BY EVENTS
 * ======================================
 *
 */

/**
 * Hold the timeline microlocation headers in place while scroll
 */
$(".timeline").scroll(function () {
    var cont = $(this);
    var el = $(cont.find(".microlocation-inner")[0]);
    var elementTop = el.position().top;
    var pos = cont.scrollTop() + elementTop;
    cont.find(".microlocation-header").css("top", pos + "px");
});

/**
 * Handle track-view and session-view sessions search
 */
$("#sessions-public-search").valueChange(function (value) {
    var trackFiltered = [];
    var sessionFiltered = [];
    var trackSessionRows = $("#tracks-timeline .mobile-sessions-holder .event").parent().parent();
    var sessionSessionRows = $('#session-view-holder .list-group-item');

    if (_.isEmpty(value) || value === "") {
        trackFiltered = trackSessionRows;
        sessionFiltered = sessionSessionRows;
    } else {
        trackFiltered = _.filter($(trackSessionRows), function (session) {
            return fuzzyMatch($(session).find('.title').text(), value);
        });
        sessionFiltered = _.filter($(sessionSessionRows), function (session) {
            return fuzzyMatch($(session).find('.session-title').text(), value);
        });
    }

    $(trackSessionRows).hide();
    $(sessionSessionRows).hide();

    if (trackFiltered.length === 0) {
        $(".no-sessions-info").show();
    } else {
        $(".no-sessions-info").hide();
        _.each(trackFiltered, function (session) {
            $(session).show();
        });
    }

    if (sessionFiltered.length === 0) {
        $(".no-sessions-info").show();
    } else {
        $(".no-sessions-info").hide();
        _.each(sessionFiltered, function (session) {
            $(session).show();
        });
    }
});

/**
 * Handle unscheduled sessions search
 */
$("#sessions-search").valueChange(function (value) {
    var filtered = [];

    if (_.isEmpty(value) || value === "") {
        filtered = unscheduledStore;
    } else {
        filtered = _.filter(unscheduledStore, function (session) {
            return fuzzyMatch(session.title, value);
        });
    }

    filtered = _.sortBy(filtered, "title");
    filtered = _.uniqBy(filtered, "id");

    $unscheduledSessionsHolder.html("");

    if (filtered.length === 0) {
        $(".no-sessions-info").show();
    } else {
        $(".no-sessions-info").hide();
        _.each(filtered, function (session) {
            addSessionToUnscheduled(session, true);
        });
    }
});

$addMicrolocationForm.submit(function (event) {
    event.preventDefault();
    var payload = {
        "room": $addMicrolocationForm.find("input[name=room]").val(),
        "latitude": parseFloat($addMicrolocationForm.find("input[name=latitude]").val()),
        "name": $addMicrolocationForm.find("input[name=name]").val(),
        "longitude": parseFloat($addMicrolocationForm.find("input[name=longitude]").val()),
        "floor": parseInt($addMicrolocationForm.find("input[name=floor]").val())
    };

    api.microlocations.post_microlocation_list({event_id: mainEvent.id, payload: payload}, function (success) {
        addMicrolocationToTimeline(success.obj);
        $addMicrolocationForm.find(".modal").modal("hide");
        $addMicrolocationForm.find("input, textarea").val("");
        createSnackbar("Microlocation has been created successfully.");
    }, function (error) {
        logError('failed with the following: ' + error.statusText, error);
        createSnackbar("An error occurred while creating microlocation.", "Try Again", function () {
            $addMicrolocationForm.trigger("submit");
        });
    });
});

$(".export-png-button").click(function () {
    html2canvas($timeline[0], {
        onrendered: function (canvas) {
            canvas.id = "generated-canvas";
            canvas.toBlob(function (blob) {
                saveAs(blob, "timeline.png");
            });
        }
    });
});

/**
 * Global document events for date change button, remove button and clear overlaps button
 */

$(document)
    .on("click", ".date-change-btn", function () {
        $(this).addClass("active").siblings().removeClass("active");
        loadMicrolocationsToTimeline($(this).text());
        $("#sessions-public-search").val("");
    })
    .on("click", ".session.scheduled > .remove-btn", function () {
        addSessionToUnscheduled($(this).parent());
    })
    .on("click", ".session.scheduled", function () {
        try {
            $('.session.scheduled').not(this).popover('hide');
            $(this).popover('toggle');
            if ($('.scheduler-pop').length !== 0) {
                var scheduler_height = $('.scheduler-holder').height();
                var popover_height = parseInt($('.popover').css('top')) + $('.popover').height();
                if (popover_height > scheduler_height) {
                    $('.scheduler-holder').height(scheduler_height + $('.popover').height());
                } else {
                    $('.scheduler-holder').height($('.timeline').height());
                }
                if ($('.popover').length === 0) {
                    $('.scheduler-holder').height($('.timeline').height());
                }
            }
        } catch (ignored) { }
    })
    .on("click", ".session.scheduled > .edit-btn", function () {
        var $sessionElement = $(this).parent();
        var session = $sessionElement.data("session");
        location.href = "/events/" + window.mainEvent.id + "/sessions/" + session.id + "/edit/";
    })
    .on("click", ".rooms-view", function(){
        $dayButtonsHolder.show();
        $timeline.removeClass('hidden');
        $tracksTimeline.addClass('hidden');
        $sessionViewHolder.addClass('hidden');
        $('#public-track-navbar').addClass('hidden');
        $(this).addClass("active").siblings().removeClass("active");
    })
    .on("click", ".tracks-view", function(){
        $dayButtonsHolder.show();
        $timeline.addClass('hidden');
        $mobileTimeline.addClass('hidden');
        $tracksTimeline.removeClass('hidden');
        $sessionViewHolder.addClass('hidden');
        $('#public-track-navbar').removeClass('hidden');
        $(this).addClass("active").siblings().removeClass("active");
    })
    .on("click", ".sessions-view", function() {
        $dayButtonsHolder.hide();
        $sessionViewHolder.removeClass('hidden');
        $timeline.addClass('hidden');
        $mobileTimeline.addClass('hidden');
        $tracksTimeline.addClass('hidden');
        $('#public-track-navbar').addClass('hidden');
        $(this).addClass("active").siblings().removeClass("active");

    })
    .on("click", ".clear-overlaps-button", removeOverlaps);

/**
 * Initialize the Scheduler UI on document ready
 */
$(document).ready(function () {
    window.mainEvent.id = parseInt($timeline.data("event-id"));
    window.mainEvent.starts_at = moment.utc($timeline.data("event-start"));
    window.mainEvent.ends_at = moment.utc($timeline.data("event-end"));
    initializeTimeline(window.mainEvent.id);
});

$(document).on("scheduling:recount", function(e) {
    var microlocations = _.cloneDeep(e.microlocations);
    _.each(microlocations, function(microlocation_id){
        var $microlocationColumn = $microlocationsHolder.find(".microlocation[data-microlocation-id=" + microlocation_id + "]");
        $microlocationColumn.find(".microlocation-header").find(".badge").text($microlocationColumn.find(".session.scheduled").length)
    });
});

$(document).on("scheduling:change", function (e) {
    if (!isReadOnly()) {
        // Make a deep clone of the session object
        var session = _.cloneDeep(e.session);
        var session_id = session.id;

        // Format the payload to match API requirements
        session.starts_at = session.starts_at.format(time.format);
        session.ends_at = session.ends_at.format(time.format);
        session.track_id = (_.isNull(session.track) || _.isNull(session.track.id)) ? null : session.track.id;
        session.microlocation_id = (_.isNull(session.microlocation) || _.isNull(session.microlocation.id)) ? null : session.microlocation.id;
        session.speaker_ids = _.map(session.speakers, 'id');

        // Clean up the payload
        delete session.language;
        delete session.speakers;
        delete session.microlocation;
        delete session.duration;
        delete session.top;
        delete session.id;

        api.sessions.put_session({
            event_id: mainEvent.id,
            session_id: session_id,
            payload: session
        }, function () {
            createSnackbar("Changes have been saved.", "Dismiss", null, 1000);
        }, function (error) {
            logError('failed with the following: ' + error.statusText, error);
            createSnackbar("An error occurred while saving the changes.", "Try Again", function () {
                $(document).trigger({
                    type: "scheduling:change",
                    session: e.session
                });
            });
        });
    }
});