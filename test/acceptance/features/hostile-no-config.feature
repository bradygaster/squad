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

  Scenario: Status reports no squad without .squad/ directory
    Given a directory without a ".squad" directory
    When I run "squad status" in the temp directory
    Then the output contains "not initialized"
    And the exit code is 0

  Scenario: Doctor runs without .squad/ directory
    Given a directory without a ".squad" directory
    When I run "squad doctor" in the temp directory
    Then the exit code is 0

  Scenario: Unknown command without .squad/ still errors cleanly
    Given a directory without a ".squad" directory
    When I run "squad garbage-cmd" in the temp directory
    Then the output contains "Unknown command"
    And the exit code is 1
