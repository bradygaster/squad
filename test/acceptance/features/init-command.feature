Feature: Init command

  Scenario: Init in existing project shows ready message
    Given a temporary project with an existing ".squad" directory
    When I run "squad init" in the temp directory
    Then the output contains "Squad initialized"
    And the output contains "already exists"
    And the exit code is 0

  Scenario: Init exit code is zero on success
    Given a directory without a ".squad" directory
    When I run "squad init" in the temp directory
    Then the exit code is 0
