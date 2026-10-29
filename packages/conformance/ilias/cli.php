<?php
// Test-only ILIAS commands for the end-to-end job (M2-21), run inside the web server container as
// its user from the ILIAS folder (see ilias.ts). Each prints one line of JSON last.
//
//   php cli.php site                             the learner account
//   php cli.php upload <name> <scorm|scorm2004> < zip
//                                                the package as a SCORM learning module in the
//                                                repository, online and readable by every user
//   php cli.php tracks <obj_id>                  what ILIAS recorded for the learner
//
// It signs in the way ILIAS's own command-line cron runner does (components/ILIAS/Cron/src/CLI),
// as root, and creates the learning module the way ILIAS's upload form does
// (ilObjSAHSLearningModuleGUI::uploadObject).

chdir('/var/www/ilias');
require_once 'vendor/composer/vendor/autoload.php';

const CLIENT = 'coursesuite';
const LEARNER = ['login' => 'learner', 'password' => 'Learner-pass-1'];

[, $action, $argument, $subtype] = $argv + [null, '', '', ''];
$startup = new \ILIAS\Cron\CLI\StartUp(CLIENT, 'root');
$startup->authenticate();
// ILIAS names the web data folder relative to its web root, as its pages run there.
chdir('/var/www/ilias/public');
global $DIC;
$db = $DIC->database();

/** The object id of the global role `title`, such as the "User" role every account has. */
function globalRole(string $title): int
{
    global $DIC;
    $set = $DIC->database()->queryF(
        "SELECT obj_id FROM object_data WHERE type = 'role' AND title = %s",
        ['text'],
        [$title]
    );
    $row = $DIC->database()->fetchAssoc($set);
    if (!$row) {
        throw new RuntimeException("No global role '$title'");
    }
    return (int) $row['obj_id'];
}

function learnerId(): int
{
    $id = (int) ilObjUser::_lookupId(LEARNER['login']);
    if ($id === 0) {
        throw new RuntimeException('No learner account: run `php cli.php site` first');
    }
    return $id;
}

try {
    switch ($action) {
        case 'site':
            if (!ilObjUser::_lookupId(LEARNER['login'])) {
                $user = new ilObjUser();
                $user->setLogin(LEARNER['login']);
                $user->setFirstname('Test');
                $user->setLastname('Learner');
                $user->setEmail('learner@example.com');
                $user->setPasswd(LEARNER['password'], ilObjUser::PASSWD_PLAIN);
                $user->setLanguage('en');
                $user->setTimeLimitUnlimited(true);
                $user->create();
                $user->setActive(true, 0);
                $user->setLastPasswordChangeTS(time());
                $user->saveAsNew();
                $DIC->rbac()->admin()->assignUser(globalRole('User'), $user->getId());
            }
            // A password set by an administrator is one to change at first login; the learner's
            // counts as just chosen, so ILIAS opens the course rather than its password form.
            $DIC->settings()->set('ps_password_change_on_first_login_enabled', '0');
            $db->manipulateF(
                'UPDATE usr_data SET last_password_change = %s, passwd_policy_reset = %s WHERE usr_id = %s',
                ['integer', 'integer', 'integer'],
                [time(), 0, learnerId()]
            );
            // Learning progress on, and SCORM modules tracked by it from upload, as a site that
            // grades SCORM sets them (Administration > Learning Progress; Learning Modules SCORM).
            // Without it ILIAS launches every module with no credit, and its SCORM 1.2 player then
            // drops every status and score the SCO sets.
            $DIC->settings()->set('enable_tracking', '1');
            (new ilSetting('lm'))->set('scorm_lp_auto_activate', '1');
            $result = ['learner' => LEARNER['login'], 'id' => learnerId()];
            break;

        case 'upload':
            $module = $subtype === 'scorm2004'
                ? new ilObjSCORM2004LearningModule()
                : new ilObjSCORMLearningModule();
            $module->setTitle($argument);
            $module->setSubType($subtype === 'scorm2004' ? 'scorm2004' : 'scorm');
            $module->setDescription('');
            $module->create(true);
            $module->createReference();
            $module->putInTree(ROOT_FOLDER_ID);
            $module->setPermissions(ROOT_FOLDER_ID);
            $module->createDataDirectory();
            $zip = $module->getDataDirectory() . '/package.zip';
            file_put_contents($zip, stream_get_contents(STDIN));
            $DIC->legacyArchives()->unzip($zip, $module->getDataDirectory(), false, false, false);
            ilFileUtils::renameExecutables($module->getDataDirectory());
            $module->readObject();
            $module->setLearningProgressSettingsAtUpload();

            // Online, and readable by the learner.
            $refId = $module->getRefId();
            $module = $subtype === 'scorm2004'
                ? new ilObjSCORM2004LearningModule($refId)
                : new ilObjSCORMLearningModule($refId);
            $module->setOfflineStatus(false);
            $module->update();
            $DIC->rbac()->admin()->grantPermission(
                globalRole('User'),
                ilRbacReview::_getOperationIdsByName(['visible', 'read']),
                $refId
            );
            $result = ['refId' => $refId, 'objId' => $module->getId()];
            break;

        case 'tracks':
            $objId = (int) $argument;
            $userId = learnerId();
            $elements = [];
            if (ilObjSAHSLearningModule::_lookupSubType($objId) === 'scorm2004') {
                // The package's one SCO: its node in cmi_node, by data model column.
                $set = $db->queryF(
                    'SELECT cmi_node.* FROM cmi_node
                     INNER JOIN cp_node ON cmi_node.cp_node_id = cp_node.cp_node_id
                     WHERE cmi_node.user_id = %s AND cp_node.slm_id = %s',
                    ['integer', 'integer'],
                    [$userId, $objId]
                );
                while ($row = $db->fetchAssoc($set)) {
                    foreach ($row as $column => $value) {
                        if ($value !== null) {
                            $elements[$column] = (string) $value;
                        }
                    }
                }
            } else {
                $set = $db->queryF(
                    'SELECT lvalue, rvalue FROM scorm_tracking WHERE obj_id = %s AND user_id = %s',
                    ['integer', 'integer'],
                    [$objId, $userId]
                );
                while ($row = $db->fetchAssoc($set)) {
                    $elements[$row['lvalue']] = (string) $row['rvalue'];
                }
            }
            $result = ['elements' => $elements];
            break;

        default:
            fwrite(STDERR, "Usage: php cli.php site | upload <name> <scorm|scorm2004> < package.zip | tracks <obj_id>\n");
            exit(2);
    }
} finally {
    $startup->logout();
}

echo "\n", json_encode($result), "\n";
