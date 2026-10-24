<?php
// Test-only Moodle commands for the end-to-end job (M1-21), run inside the web server container as
// its user (see moodle.ts). Each prints one line of JSON.
//
//   php cli.php site                  the learner account; user tours off so nothing covers the player
//   php cli.php upload <name> < zip   a new course with the learner enrolled and the SCORM package
//                                     as an activity that opens straight into the player
//   php cli.php tracks <scormid>      what Moodle recorded for the learner's last attempt

define('CLI_SCRIPT', true);
require('/var/www/html/config.php');
require_once($CFG->dirroot . '/mod/scorm/locallib.php');

const LEARNER = ['username' => 'learner', 'password' => 'Learner-pass-1'];

[, $action, $argument] = $argv + [null, '', ''];
\core\session\manager::set_user(get_admin());
$generator = \core\test\phpunit\phpunit_util::get_data_generator();

switch ($action) {
    case 'site':
        if (!$DB->record_exists('user', ['username' => LEARNER['username']])) {
            $generator->create_user(LEARNER + ['firstname' => 'Test', 'lastname' => 'Learner']);
        }
        $DB->set_field('tool_usertours_tours', 'enabled', 0);
        purge_all_caches();
        $result = ['learner' => LEARNER['username']];
        break;

    case 'upload':
        $learner = $DB->get_record('user', ['username' => LEARNER['username']], '*', MUST_EXIST);
        $course = $generator->create_course(['fullname' => $argument]);
        $generator->enrol_user($learner->id, $course->id, 'student');
        $draft = file_get_unused_draft_itemid();
        get_file_storage()->create_file_from_string([
            'contextid' => context_user::instance($USER->id)->id,
            'component' => 'user',
            'filearea' => 'draft',
            'itemid' => $draft,
            'filepath' => '/',
            'filename' => 'package.zip',
        ], stream_get_contents(STDIN));
        $scorm = $generator->create_module('scorm', [
            'course' => $course->id,
            'name' => $argument,
            'packagefile' => $draft,
            'popup' => 0,
            'skipview' => SCORM_SKIPVIEW_ALWAYS,
            'hidetoc' => SCORM_TOC_DISABLED,
            'nav' => SCORM_NAV_DISABLED,
            'forcenewattempt' => SCORM_FORCEATTEMPT_NO,
        ]);
        $result = ['cmid' => (int) $scorm->cmid, 'scormid' => (int) $scorm->id];
        break;

    case 'tracks':
        $learner = $DB->get_record('user', ['username' => LEARNER['username']], '*', MUST_EXIST);
        // The package's one SCO: the item with a launch page, not the organization above it.
        $scoes = array_filter(scorm_get_scoes((int) $argument) ?: [], fn($sco) => $sco->launch !== '');
        $tracks = $scoes ? scorm_get_tracks(reset($scoes)->id, $learner->id) : false;
        $result = [
            'attempts' => count(scorm_get_all_attempts((int) $argument, $learner->id)),
            'elements' => $tracks ? array_filter(
                (array) $tracks,
                fn($element) => str_starts_with($element, 'cmi.'),
                ARRAY_FILTER_USE_KEY,
            ) : [],
        ];
        break;

    default:
        fwrite(STDERR, "Usage: php cli.php site | upload <name> < package.zip | tracks <scormid>\n");
        exit(2);
}

echo json_encode($result), "\n";
