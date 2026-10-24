Feature: Hostile — Missing .squad/ configuration

  Scenario: Version works without .squad/ directory
    Given a directory without a ".squad" directory
    When I run "squad --version" in the temp directory
    Then the output matches pattern "\d+\.\d+\.\d+"
    And the exit code is 0

  Scenario: Help works without .squad/ directory
    Given a directory without a ".squad" directory
    When I run "squad --help" in the temp directory
    Then the output contains "Usage"
    And the exit code is 0

  Scenario: Status fails clearly without .squad/ directory (no user-profile fallback)
    Given a directory without a ".squad" directory
    When I run "squad status" in the temp directory
    Then the output contains "No squad in this directory"
    And the output contains "squad init"
    And the exit code is 1

  Scenario: Doctor fails clearly without .squad/ directory (no user-profile fallback)
    Given a directory without a ".squad" directory
    When I run "squad doctor" in the temp directory
    Then the output contains "No squad in this directory"
    And the output contains "squad init"
    And the exit code is 1

  Scenario: Unknown command without .squad/ still errors cleanly
    Given a directory without a ".squad" directory
    When I run "squad garbage-cmd" in the temp directory
    Then the output contains "Unknown command"
    And the exit code is 1
