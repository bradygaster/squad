Feature: Init command

  Scenario: Init in existing project shows ready message
    Given the current directory has a ".squad" directory
    When I run "squad init"
    Then the output contains "Squad initialized"
    And the output contains "already exists"
    And the exit code is 0

  Scenario: Init exit code is zero on success
    When I run "squad init"
    Then the exit code is 0
