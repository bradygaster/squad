Feature: Consult command

  Scenario: Help text shows consult command
    When I run "squad help"
    Then the output contains "consult"
    And the output contains "Enter consult mode with your personal squad"
    And the exit code is 0

  Scenario: Consult in non-git directory fails
    Given a directory without a ".squad" directory
    When I run "squad consult" in the temp directory
    Then the output contains "Not a git repository"
    And the exit code is 1

  Scenario: Consult --status in non-consult directory
    Given a directory without a ".squad" directory
    When I run "squad consult --status" in the temp directory
    Then the output contains "Not in consult mode"
    And the exit code is 0

  Scenario: Consult blocked in squadified project
    Given the current directory has a ".squad" directory
    When I run "squad consult --check"
    Then the output contains "No personal squad found"
    And the exit code is 1

  Scenario: Extract requires consult mode
    Given a directory without a ".squad" directory
    When I run "squad extract" in the temp directory
    Then the output contains "No .squad/config.json found"
    And the exit code is 1
