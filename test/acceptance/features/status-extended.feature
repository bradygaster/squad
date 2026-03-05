Feature: Status command extended

  Scenario: Status shows resolution details
    Given the current directory has a ".squad" directory
    When I run "squad status"
    Then the output contains "Squad Status"
    And the output contains "Active squad:"
    And the output contains "Path:"
    And the exit code is 0

  Scenario: Status in directory without squad shows no active squad
    Given a directory without a ".squad" directory
    When I run "squad status" in the temp directory
    Then the output does not contain "Active squad:  repo"
    And the exit code is 1
