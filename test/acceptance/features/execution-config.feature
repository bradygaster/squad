Feature: Execution config flags

  Scenario: triage help documents sandbox and permission profile flags
    When I run "squad triage --help"
    Then the output contains "--sandbox <provider>"
    And the output contains "--sandbox-flags"
    And the output contains "--permission-profile <mode>"
    And the exit code is 0

  Scenario: loop help documents sandbox and permission profile flags
    When I run "squad loop --help"
    Then the output contains "--sandbox <provider>"
    And the output contains "--sandbox-flags"
    And the output contains "--permission-profile <mode>"
    And the exit code is 0

  Scenario: triage rejects invalid sandbox value
    When I run "squad triage --sandbox invalid"
    Then the output contains "SQUAD_SANDBOX_INVALID_VALUE"
    And the exit code is 1

  Scenario: triage rejects invalid permission profile value
    When I run "squad triage --permission-profile invalid"
    Then the output contains "SQUAD_PERMISSION_PROFILE_INVALID_VALUE"
    And the exit code is 1
