Feature: Subcommand --help intercept (#1201)

  Scenario: init --help prints help instead of scaffolding files
    Given a directory without a ".squad" directory
    When I run "squad init --help" in the temp directory
    Then the output contains "squad init"
    And the output contains "Usage:"
    And the exit code is 0
    And the temp directory has no ".squad" entry
    And the temp directory has no ".github" entry
    And the temp directory has no ".gitignore" entry

  Scenario: triage --help prints help instead of starting a polling loop
    When I run "squad triage --help"
    Then the output contains "squad triage"
    And the output contains "Usage:"
    And the exit code is 0

  Scenario: doctor --help prints help instead of running the doctor
    When I run "squad doctor --help"
    Then the output contains "squad doctor"
    And the output contains "Usage:"
    And the exit code is 0

  Scenario: status -h short flag prints help
    When I run "squad status -h"
    Then the output contains "squad status"
    And the output contains "Usage:"
    And the exit code is 0
