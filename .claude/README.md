Done! Here's the final structure:


.claude/
  agents/
    planner.md          # อ่าน requirement -> สร้าง implementation plan
    implementer.md      # รับ plan -> generate code ทุก layer
    reviewer.md         # review code -> check rule violations
    tester.md           # generate unit/controller/integration tests
    deployer.md         # build + vet + test + verify

  commands/
    implementFeature.md # /implementFeature <plan> -> full pipeline (plan->implement->review->fix->build)
    reviewFeature.md    # /reviewFeature <scope> -> review changes against all rules
    generateTests.md    # /generateTests <target> -> generate tests for service/controller
    verifyBuild.md      # /verifyBuild -> run gofmt, vet, build, test, swag

  rules/
    code-style.md       # (existing) architecture + code rules
    security.md         # (existing) auth, crypto, input validation
    test.md             # (existing) testing rules

  templates/
    controller.go.tmpl  # controller skeleton with traceutil + httputil + swagger
    service.go.tmpl     # service skeleton with traceutil + ctx
    repo.go.tmpl        # repo skeleton with logger + bson
    router.go.tmpl      # router pattern with AllowMethods
    serviceTest.go.tmpl # table-driven service test
    controllerTest.go.tmpl # httptest controller test

  plan/                 # (existing) active plans
  done/                 # (existing) completed plans

docs/
  plan/                 # (new) feature plans input for planner agent
Flow การใช้งาน:

Planner -- อ่าน docs/plan/* หรือ .claude/plan/* -> สร้างแผน
Implementer -- รับแผน -> generate code (model -> repo -> service -> controller -> router)
Reviewer -- check layer violation, missing trace, wrong envelope, security issues
Tester -- generate test (service mock repo, controller httptest)
Deployer -- gofmt + go vet + go build + go test -race
Commands ที่ใช้ได้:

/implementFeature <plan> -- run full pipeline
/reviewFeature -- review uncommitted changes
/generateTests <path> -- generate tests
/verifyBuild -- pre-merge verification