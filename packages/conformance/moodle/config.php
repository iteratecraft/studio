<?php
// Moodle configuration for the end-to-end job (M1-21). The `code` service of compose.yaml copies it
// to /var/www/html/config.php. A throwaway test site: the passwords never leave the containers.

unset($CFG);
global $CFG;
$CFG = new stdClass();

$CFG->dbtype = 'pgsql';
$CFG->dblibrary = 'native';
$CFG->dbhost = 'db';
$CFG->dbname = 'moodle';
$CFG->dbuser = 'moodle';
$CFG->dbpass = 'moodle';
$CFG->prefix = 'mdl_';
$CFG->dboptions = [];

$CFG->wwwroot = getenv('MOODLE_WWWROOT');
$CFG->dataroot = '/var/www/moodledata';
$CFG->admin = 'admin';
$CFG->directorypermissions = 02777;

// Notices go to the web server log, which CI uploads on failure, never into a page or an answer of
// the SCORM API.
$CFG->debug = E_ALL;
$CFG->debugdisplay = 0;

require_once(__DIR__ . '/lib/setup.php');
