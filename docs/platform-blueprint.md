# Klynx Platform Blueprint

**Date:** 2026-05-04
**Status:** Working blueprint
**Primary repos read:** `klynx-api`, `klynx`
**Deployment mode in this note:** `appliance`

This document is the reader-friendly map of the platform flow. The canonical
contracts remain:

- `docs/contracts/deploymentProfile.md`
- `docs/contracts/org-lifecycle.md`
- `docs/contracts/user-profile-and-roles.md`
- `docs/contracts/permission-profile.md`
- `docs/contracts/licenseQuotaFields.md`

Use this file to understand how the pieces fit together before reading the
longer contracts.

---

## 0. ภาพรวม Flow ภาษาไทย

ส่วนนี้คือภาพจำแบบเร็วของ platform ใน `appliance` mode:

```text
ติดตั้งระบบใหม่
  -> klynx-api อ่าน DEPLOYMENT_PROFILE
      -> ถ้าไม่ตั้งค่า จะ default เป็น appliance
  -> Keycloak มี realm สำหรับ tenant
  -> ผู้ใช้ login ผ่าน realm นั้น
  -> ระบบยังอาจไม่มี ORG ใน tenant นี้
      -> FE จึงพาผู้ใช้ไปสร้าง ORG แรก
  -> หลังมี ORG แล้ว FE จะเลือก active org
  -> ทุก API ที่เป็น org-scoped จะส่ง X-Active-Org
  -> BE ตรวจสิทธิ์จาก Keycloak + Permify + license/customer policy
```

ภาพจำที่สำคัญที่สุด:

```text
Keycloak realm
  = tenant ชั้น identity

ORG
  = workspace ภายใน tenant

X-Active-Org
  = org ที่ผู้ใช้กำลังทำงานอยู่ใน request นั้น

platformRole
  = role ระดับ platform จาก Keycloak realm_access.roles[]

orgRole
  = role ระดับ ORG จาก Permify

permission profile
  = สิทธิ์ระดับเมนู / resource / camera / edge / kcontrol
```

### 0.1 Login และ Tenant Flow

```text
User เปิด FE
  -> FE init Keycloak
  -> User login
  -> Keycloak ออก JWT
      -> iss = .../realms/<realm>
      -> realm_access.roles[] = role ระดับ platform
  -> FE เก็บ token
  -> FE เรียก BE
  -> BE AuthBearer()
      -> อ่าน realm จาก iss
      -> set tenantId = realm
      -> อ่าน realm_access.roles[]
      -> set platformRole = administrator หรือ user
```

แปลตรง ๆ:

- `tenantId` ไม่ได้มาจาก ORG
- `tenantId` มาจาก Keycloak realm
- ORG เป็น boundary อีกชั้นหนึ่งใต้ tenant

### 0.2 First Login / First ORG Flow

```text
Login สำเร็จ
  -> FE เรียก GET /kapi/orgs/
      -> BE lookup org ที่ user เห็นได้จาก Permify

ถ้า org list ว่าง
  -> FE เปิด dialog สร้าง ORG
  -> User กดสร้าง ORG
  -> FE เรียก POST /kapi/orgs/
  -> BE ตรวจ 4 ชั้น
      1. platform_license.selfServiceOrgCreationEnabled
      2. tenant_policies.allowSelfServiceOrgCreation
      3. customer_accounts.selfServiceOrgCreationEnabled + maxOrganizations
      4. customer user policy canCreateOrganization
  -> ถ้าผ่าน
      -> สร้าง organizations row
      -> เขียน Permify tuple ให้ user เป็น owner/admin/member ตาม bootstrap
      -> bootstrap subscription ของ org
      -> provision workspace ฝั่ง gateway/phibek ตาม deployment profile
```

จุดที่ดูงงได้:

```text
FE อาจแสดงปุ่ม/หน้า create org
  เพราะ effectiveAccess.canCreateOrganization ผ่าน Layer 1+2

แต่ตอนกด POST /orgs อาจยัง 403
  เพราะ Layer 3 หรือ Layer 4 ไม่ผ่าน
```

ให้ดู `details.cause` ใน response:

```text
details.cause = license       -> ติด platform license gate
details.cause = tenantPolicy  -> ติด tenant policy
details.cause = customer      -> customer account ปิด self-service
details.cause = limit         -> customer account ถึง maxOrganizations
details.cause = user          -> user policy ไม่ให้สร้าง org
```

### 0.3 Appliance License Activation Flow

```text
Admin เข้า /admin/platform-license
  -> upload signed license artifact
  -> FE เรียก POST /kapi/admin/platformLicense/activate
  -> BE ตรวจ signature + semantic
  -> BE persist platform_license.artifactMeta
  -> BE seed tenant_policies ที่ยังไม่มี row
  -> BE repair org subscriptions ให้ตรงกับ license plan
```

ใน `appliance` mode ภาพที่ควรเป็นคือ:

```text
License artifact
  -> platform_license
  -> customer_accounts.planId / maxOrganizations
  -> subscriptions[orgId]
  -> org creation quota gate
```

Known issue ที่ควรระวังตอนนี้:

```text
License activate สำเร็จ
  -> subscriptions[orgId] ถูก repair แล้ว
  -> แต่ customer_accounts.planId / maxOrganizations อาจยัง stale
  -> User สร้าง ORG แล้วโดน 403 cause=limit
```

ถ้าเจออาการนี้ ให้เช็ค `GET /kapi/self/customer` ก่อนสงสัย Keycloak หรือ Permify
เพราะ org creation gate อ่าน limit จาก `customer_accounts.maxOrganizations`.

### 0.4 Active ORG และ Effective Access Flow

```text
FE มี org list แล้ว
  -> user เลือก ORG หรือ FE restore จาก localStorage
  -> FE เก็บใน useMyOrganization()
  -> useApi() auto inject X-Active-Org
  -> BE ActiveOrg()
      -> ถ้า platformRole=administrator
          -> bypass org membership check
      -> ถ้าไม่ใช่ platform admin
          -> ตรวจ Permify organization:view
  -> FE เรียก GET /kapi/orgs/effectiveAccess
  -> BE คืน:
      -> visibleMenuIds[]
      -> platformCapabilities
      -> orgCapabilities
```

ใช้ค่านี้แยกแบบนี้:

```text
visibleMenuIds[]
  -> เมนูไหนแสดงใน sidebar

platformCapabilities
  -> ความสามารถระดับ platform เช่น manage subscription/settings/create org

orgCapabilities
  -> ความสามารถใน active org เช่น manage members/org units/resource permissions
```

### 0.5 Permission Profile / Resource Access Flow

```text
User เปิดหน้า resource เช่น camera / edge / kcontrol / stream
  -> FE ส่ง X-Active-Org
  -> BE รู้ tenantId จาก realm
  -> BE รู้ activeOrg จาก header
  -> BE ตรวจ user มีสิทธิ์เห็นเมนูหรือ resource หรือไม่
      -> orgRole จาก Permify
      -> permission_profiles จาก Mongo
      -> direct grants / orgUnit / resourceGroup / memberIds
  -> BE filter รายการ resource ก่อนส่งกลับ
```

เมนูเห็นได้ ไม่ได้แปลว่า resource ทุกตัวเห็นได้:

```text
เห็นเมนู Cameras
  -> แปลว่าเข้า page ได้

เห็น camera A/B/C
  -> ต้องผ่าน resolver จาก permission profile

เปิด stream camera A
  -> stream endpoint ตรวจ resolver อีกครั้ง
```

### 0.6 จุดที่ทำให้ Permission ดูแปลก

```text
Keycloak realm_access.roles[] มี administrator
  -> BE AuthBearer มองเป็น platformRole=administrator

แต่ FE บางจุดยังอ่าน authStore.user.role จาก flat token claim role
  -> ถ้า token ไม่มี flat role=administrator
      -> FE อาจซ่อนเมนู admin
      -> หรือ middleware FE redirect กลับ dashboard
```

และฝั่ง BE บาง admin middleware ยังเป็น legacy:

```text
AuthBearer ผ่าน
  -> platformRole=administrator
  -> แต่ route ใช้ RequireRoles(["administrator"])
      -> RequireRoles อ่าน flat claims["role"]
      -> ถ้า flat role ไม่มี
          -> 403
```

แนวทางแก้ในอนาคต:

```text
FE:
  ใช้ platformRole canonical จาก /users/profile หรือ derive จาก realm_access.roles[]

BE:
  เปลี่ยน admin guard ที่ยังอ่าน flat role ให้ใช้ platformRole local

Create ORG UX:
  อ่าน details.cause แทนการ match message string
```

### 0.7 ResourceGroups / Camera Import / Public-Private / Permission Profile Flow

ResourceGroups คือกลุ่มจัดระเบียบ resource ใน ORG โดยเฉพาะ camera. มันมี 2
บทบาทหลัก:

```text
1. จัดหมวดหมู่ camera
   -> เช่น All Cameras / Bangkok HQ / Floor 1
   -> ใช้กับ tree, filter, icon, import/export

2. เป็น input ให้ permission profile
   -> profile ผูก orgUnit/member เข้ากับ resourceGroups
   -> resolver เอา resourceGroups ไปหา camera ที่ user เห็นได้
```

ภาพรวม flow ตั้งแต่สร้าง/import camera:

```text
Admin อยู่ใน active ORG
  -> FE ส่ง X-Active-Org
  -> Admin สร้าง ResourceGroup tree
      POST /kapi/resources/groups
      PATCH /kapi/resources/groups/{id}
  -> Admin สร้าง/import Camera
      single create/edit หรือ
      POST /kapi/resources/camera/import
  -> BE เขียน:
      resource_groups ใน Mongo
      camera projection ใน Mongo
      Permify tuple camera -> parentGroup -> resourceGroup
      Permify tuple camera -> parentOrg -> organization
  -> Camera ถูกจัดเข้ากลุ่ม
  -> Permission profile ใช้กลุ่มนั้นในการให้สิทธิ์
```

#### 0.7.1 ResourceGroup Tree Flow

```text
สร้างกลุ่ม Root
  -> POST /kapi/resources/groups
      name = "All Cameras"
      parentGroupId = null
      resourceType = "camera"

สร้างกลุ่มลูก
  -> POST /kapi/resources/groups
      name = "Floor 1"
      parentGroupId = "rg-all-cameras"
      resourceType = "camera"

BE ตรวจ:
  -> ห้าม parent เป็นตัวเอง
  -> ห้าม cycle
  -> parent ต้องอยู่ tenantId + orgId เดียวกัน
  -> group name unique ต่อ ORG
```

ข้อสำคัญ:

```text
ResourceGroup ข้าม ORG ไม่ได้
  -> org A เอา group ของ org B มาเป็น parent ไม่ได้

ResourceGroup visibility ไม่ inherit
  -> parent public ไม่ได้ทำให้ child public อัตโนมัติ
  -> parent internal ไม่ได้ทำให้ child internal อัตโนมัติ
  -> แต่ละ group มี mapVisibility / filterVisibility ของตัวเอง
```

#### 0.7.2 Camera Import Flow

```text
Admin กด Bulk import ที่หน้า Cameras
  -> FE ส่ง file ไป POST /kapi/resources/camera/import
      headers:
        Authorization: Bearer <token>
        X-Active-Org: <orgId>
      body:
        multipart file (.xlsx/.csv)
  -> BE อ่าน Cameras sheet
  -> BE อ่าน ResourceGroups sheet ก่อน ถ้ามี
  -> BE reconcile ResourceGroups
  -> BE reconcile Cameras
  -> BE เขียน camera -> resourceGroup tuple ตาม resourceGroupIds
```

ในไฟล์ import มี 2 แบบหลัก:

```text
แบบเก่า / ง่าย:
  Cameras sheet มี groups หรือ group
    -> ใส่ชื่อกลุ่ม เช่น "Lobby,Entrance"
    -> BE lookup group จากชื่อใน active ORG
    -> ถ้าหาไม่เจอ camera ยัง import ได้
    -> แต่รายงาน unresolvedGroupNames เป็น warning

แบบ round-trip:
  ResourceGroups sheet
    -> สร้าง/update group tree ก่อน
  Cameras sheet
    -> ใส่ resourceGroupIds
    -> อ้าง group ที่มีอยู่แล้ว หรือ group ที่เพิ่งสร้างในไฟล์เดียวกัน
```

ภาพ flow import แบบ round-trip:

```text
XLSX upload
  -> ResourceGroups sheet processed first
      -> create / update / unchanged / rejected
  -> Cameras sheet processed second
      -> create / update / unchanged / rejected
      -> bind camera to resourceGroupIds
  -> ถ้า group row rejected
      -> camera ที่อ้าง group นั้นยัง import ได้
      -> แต่ไม่มี parentGroup tuple สำหรับ group นั้น
      -> response มี unresolvedGroupIds / unresolvedGroupNames
```

#### 0.7.3 Camera Public / Private Flow

Camera visibility บน map ใช้ `camera.mapVisibility` เป็นหลัก:

```text
camera.mapVisibility = private
  -> เห็นใน ORG ตัวเองตาม permission / admin scope
  -> ไม่เป็น public cross-org

camera.mapVisibility = public หรือ forcePublic
  -> เป็น public camera
  -> cross-org/public map flow อาจเห็นได้ตาม endpoint

camera.mapVisibility = inherit
  -> ใช้ default/logic ของ camera flow
  -> ไม่ควรเดาเองจาก FE ถ้า contract ไม่บอก
```

ResourceGroup ก็มี visibility ของตัวเอง แต่ความหมายคนละส่วน:

```text
resourceGroup.mapVisibility
  -> presentation/map metadata ของ group
  -> ใช้กับ icon / map option behavior บางจุด
  -> ไม่ใช่ตัวตัดสินเดียวว่า camera public/private

resourceGroup.filterVisibility
  -> public/internal สำหรับ picker/filter surface
  -> internal group อาจไม่แสดงใน public picker
  -> แต่ยังเป็น grant target ใน permission profile ได้
```

สรุปให้จำง่าย:

```text
Camera public/private
  -> ดู camera.mapVisibility

Group public/internal ใน filter
  -> ดู resourceGroup.filterVisibility

Permission profile grant
  -> ใช้ resourceGroupIds ได้ แม้ group จะ internal
```

#### 0.7.4 Permission Profile ผูก ResourceGroups ยังไง

Permission profile คือการบอกว่า "ใคร" เห็น "อะไร":

```text
ใคร:
  -> orgUnits
  -> includeOrgUnitChildren
  -> memberIds narrowing

อะไร:
  -> resourceGroups
  -> includeResourceGroupChildren
  -> cameras direct grants
  -> kControls direct grants
  -> edges direct grants

ทำอะไรได้:
  -> relations เช่น viewer / editor / deleter
```

Flow ให้สิทธิ์ด้วย ResourceGroups:

```text
Admin เปิด Resource Permission Profile
  -> เลือก orgUnit หรือ member scope
  -> เลือก resourceGroups เช่น "Bangkok HQ"
  -> เลือก includeResourceGroupChildren?
      false:
        -> ได้เฉพาะ camera ที่ผูกกับ group Bangkok HQ ตรง ๆ
      true:
        -> ได้ camera ใน Bangkok HQ + group ลูกทั้งหมด เช่น Floor 1 / Floor 2
  -> FE ส่ง PATCH /kapi/orgs/resource/permissions/{profileId}
      {
        "orgUnits": ["ou-1"],
        "resourceGroups": ["rg-bangkok"],
        "includeResourceGroupChildren": true,
        "relations": ["viewer"]
      }
  -> BE persist permission_profiles
  -> resolver ใช้ profile ตอน list camera / stream / resource access
```

Resolver ตอน user เปิด camera list:

```text
User เปิด Cameras page
  -> FE ส่ง X-Active-Org
  -> BE รู้ userId + tenantId + activeOrg

ถ้า platformRole=administrator
  -> เห็นทุก camera ใน active org

ถ้า user มี organization.manage ใน active org
  -> org admin เห็นทุก camera ใน active org

ถ้าเป็น regular member
  -> BE หา permission profiles ที่ user match
      -> orgUnit match
      -> memberIds ไม่ block
      -> profile status active
  -> BE เอา profile.resourceGroupIds
      -> ถ้า includeResourceGroupChildren=true expand descendants
  -> BE หา camera ที่มี tuple parentGroup อยู่ในกลุ่มเหล่านั้น
  -> BE union กับ direct camera grants
  -> ส่งกลับเฉพาะ camera ที่ resolver อนุญาต
```

#### 0.7.5 ตัวอย่าง End-to-End

```text
1. Admin สร้าง group:
   All Cameras
     -> Bangkok HQ
        -> Floor 1
        -> Floor 2

2. Admin import cameras:
   Camera A -> Floor 1
   Camera B -> Floor 2
   Camera C -> All Cameras

3. Admin สร้าง permission profile:
   orgUnits = ["Security Team"]
   resourceGroups = ["Bangkok HQ"]
   includeResourceGroupChildren = true
   relations = ["viewer"]

4. User อยู่ใน Security Team
   -> เปิด Cameras page
   -> resolver expand Bangkok HQ -> Floor 1 + Floor 2
   -> User เห็น Camera A และ Camera B
   -> User ไม่เห็น Camera C ถ้า Camera C ผูกเฉพาะ All Cameras

5. ถ้า includeResourceGroupChildren = false
   -> User เห็นเฉพาะ camera ที่ผูกตรงกับ Bangkok HQ
   -> ไม่เห็น camera ใน Floor 1 / Floor 2
```

#### 0.7.6 Import สำเร็จ แต่สิทธิ์ยังไม่มา ต้องเช็คอะไร

```text
Import response success=true
  -> แปลว่า Mongo camera write สำเร็จ

แต่ถ้า permifySyncFailed มี camId
  -> camera row ถูกสร้างแล้ว
  -> แต่ tuple camera -> resourceGroup อาจไม่ครบ
  -> permission resolver อาจยังหา camera ไม่เจอ
  -> ให้ re-save / re-import / repair tuple ตาม runbook
```

ถ้า camera ไม่เข้า group หลัง import:

```text
ดู response:
  unresolvedGroupNames[]
  unresolvedGroupIds[]

ถ้ามีค่า:
  -> ชื่อ/id group ในไฟล์ไม่ตรงกับ group ใน ORG
  -> หรือ ResourceGroups sheet row ของ group นั้น rejected
  -> camera ยังอยู่ในระบบ แต่ไม่ได้ผูก group นั้น
```

ถ้า user เห็นเมนู Cameras แต่ไม่เห็นกล้อง:

```text
เช็คตามลำดับ:
  1. User อยู่ใน active ORG ไหม
  2. User เป็น platform admin หรือ org admin ไหม
  3. permission profile active ไหม
  4. orgUnit/memberIds match user ไหม
  5. profile.resourceGroupIds ถูกต้องไหม
  6. ต้องเปิด includeResourceGroupChildren ไหม
  7. camera มี parentGroup tuple ไปยัง group นั้นจริงไหม
  8. import response มี permifySyncFailed หรือ unresolvedGroupIds/Names ไหม
```

#### 0.7.7 Scenario: pointit / หน้าบ้าน / ชั้น2

ตัวอย่าง test case ที่ใช้อธิบาย expected behavior:

```text
ORG:
  pointit
  members = 6

OrgUnit tree:
  pointit
    -> หน้าบ้าน
        -> ชั้น2

Users:
  admin   = adminPlatform
  aliz    = adminOrg
  aliz66  = user/memberOrg อยู่ OU ชั้น2
  aliz67  = user/memberOrg อยู่ OU หน้าบ้าน

Cameras:
  front1 = public
  fl2    = private

ResourceGroups:
  สาธารณะ
    -> front1
  ภายใน
    -> ชั้น2
        -> fl2

Resource Permission Profiles:
  ชั้น2    = disabled
  หน้าบ้าน = enabled, relations = viewer + creator + editor + deleter
             orgUnits = เลือกทุกหน่วยงาน
             resourceGroups = ภายใน
             includeResourceGroupChildren = true
```

Expected resolver result:

```text
aliz67 อยู่ OU หน้าบ้าน
  -> match profile หน้าบ้าน โดยตรง
  -> profile เลือก RG ภายใน + includeResourceGroupChildren=true
  -> expand ภายใน -> ชั้น2
  -> เห็น fl2

aliz66 อยู่ OU ชั้น2
  -> ถ้า profile เลือก orgUnits = ทุกหน่วยงาน
      -> match profile
      -> เห็น fl2

ถ้า profile เลือกเฉพาะ OU หน้าบ้าน:
  -> aliz67 เห็น
  -> aliz66 จะเห็นก็ต่อเมื่อ includeOrgUnitChildren=true
     เพราะ aliz66 เป็น child ของหน้าบ้าน

ถ้า profile เลือกเฉพาะ OU ชั้น2:
  -> aliz66 เห็นโดยตรง
  -> aliz67 อาจเห็นด้วยใน current resolver
     เพราะ BE expand OU ฝั่ง user ลงไปหา descendants ก่อน match profile
     ดังนั้น user ที่อยู่ parent OU สามารถ match profile ของ child OU ได้
```

หมายเหตุสำคัญ: current BE resolver ทำ 2 เรื่องแยกกัน:

```text
OrgUnit side:
  user direct OU -> expand descendants
  แล้วเอาไป match active permission profiles

ResourceGroup side:
  profile.resourceGroupIds
  -> expand descendants เฉพาะเมื่อ includeResourceGroupChildren=true
```

ดังนั้นต้องระวังคำว่า "รวมหน่วยงานย่อย" กับ "รวมกลุ่มย่อย" เป็นคนละ flag:

```text
includeOrgUnitChildren
  -> profile ที่เลือก OU parent ใช้กับ user ใน OU child ได้

includeResourceGroupChildren
  -> profile ที่เลือก RG parent ใช้กับ camera ใน RG child ได้
```

#### 0.7.8 Target: Resource Permission ต้องเปิดเมนูและปุ่มตาม relation

หลักการ target สำหรับ regular member:

```text
ถ้า user มี ResourcePermissionProfile ที่ active
และ resolver พบ camera อย่างน้อย 1 ตัว
  -> effectiveAccess.visibleMenuIds ต้องมี systemDevices + systemDevicesCameras
  -> FE ต้องเห็นเมนู "กล้องวงจรปิด"
  -> รายการกล้องต้องเป็นกล้องที่ resolver อนุญาตเท่านั้น
```

Relation mapping ที่ควรใช้กับปุ่ม:

```text
viewer
  -> เห็นเมนู
  -> เห็นรายการกล้องที่ได้รับสิทธิ์
  -> เปิดดู stream / detail read-only ได้
  -> export ได้ถ้า export เป็น read operation
  -> hide add / edit / delete / import / mapVisibility toggle

creator
  -> show ปุ่มเพิ่มกล้อง
  -> show import ถ้า import มี create rows
  -> backend ต้อง 403 ถ้าไม่มี creator แต่พยายาม create

editor
  -> show edit
  -> show mapVisibility toggle รายตัว
  -> show import ถ้า import มี update rows
  -> backend ต้อง 403 ถ้าไม่มี editor แต่พยายาม update

deleter
  -> show delete
  -> backend ต้อง 403 ถ้าไม่มี deleter แต่พยายาม delete
```

Default คือ deny:

```text
ถ้าไม่มี relation นั้น
  -> FE ซ่อนปุ่ม
  -> ถ้ายิง API ตรง BE ต้องตอบ 403
```

ถ้ามีหลาย profile และสิทธิ์ทับซ้อนกัน:

```text
Profile A: ชั้น2 เปิด viewer + editor
Profile B: หน้าบ้าน เปิด viewer + deleter

Camera fl2 อยู่ในทั้งสอง path
  -> รวมสิทธิ์เป็น viewer + editor + deleter
  -> ไม่มี creator
  -> user เห็น view/edit/delete
  -> user ไม่เห็น create/import-create
  -> BE ต้อง 403 ถ้าพยายาม create
```

Current gap ที่เห็นจาก code:

```text
ResourcePermissionProfile
  -> ใช้ resolve camera/resource access
  -> แต่ไม่ได้เพิ่ม visibleMenuIds โดยตรง

Menu visibility ตอนนี้มาจาก:
  -> baseline menus
  -> orgManagement menus
  -> MenuPermissionProfiles
  -> platformAdmin menus

systemDevicesCameras seed เป็น platformAdmin และ Grantable=false
  -> regular member ได้ resource permission แล้วก็ยังอาจไม่เห็นเมนู
  -> ตรงกับอาการ aliz66 / aliz67 ไม่เห็นเมนูกล้อง
```

Target fix ควรมีอย่างใดอย่างหนึ่ง:

```text
Option A:
  effectiveAccess เพิ่ม resource-derived menu grants
  ถ้า ResolveViewableEntityIDs(..., "camera") non-empty
    -> add systemDevices + systemDevicesCameras

Option B:
  ทำ systemDevicesCameras เป็น grantable menu
  แล้วให้ admin สร้าง MenuPermissionProfile ควบคู่ ResourcePermissionProfile

Option A เหมาะกว่า UX ปัจจุบัน
  เพราะ user ได้สิทธิ์ resource แล้วควรเห็นเมนู resource นั้นอัตโนมัติ
```

#### 0.7.9 Target: Dashboard / biDash / Videowall Ownership Scope

หน้าที่ไม่ได้เป็น camera management โดยตรงต้องใช้ camera set เดียวกัน:

```text
owner set
  = camera ใน active ORG ที่ user เห็นจาก permission resolver
  + camera ที่ user เห็นเพราะเป็น org admin/platform admin

public set
  = camera public จาก mapVisibility public/forcePublic
  - camera ที่ถูกนับอยู่ใน owner set แล้ว
```

Owner wins rule:

```text
ถ้า camera public ถูกจับเข้าทำสิทธิ์ให้ user ด้วย
  -> นับเป็น owner
  -> ไม่ซ้ำนับใน public

ตัวอย่าง:
  front1 = public
  fl2 = private
  profile ให้สิทธิ์ทั้ง front1 และ fl2

ผลรวม:
  owner = 2
  public = 0 หรือ public ไม่รวม front1 อีก
  all = 2
```

Dashboard / biDash ต้อง filter ได้:

```text
scope = all
  -> owner + public แบบ dedupe

scope = owner
  -> เฉพาะ owner set

scope = public
  -> เฉพาะ public set ที่ยังไม่อยู่ใน owner

resourceGroups filter
  -> filter หลังจากเลือก scope แล้ว
  -> ต้องใช้ RG tree/tuple เดียวกับ camera resolver
```

Videowall target:

```text
ตอนนี้มี search
  -> เพิ่ม filter: all / owner / public
  -> เพิ่ม filter by resourceGroups
  -> camera list ใน videowall ต้องใช้ access scope เดียวกับ dashboard/biDash
  -> stream endpoint ยังต้อง enforce resolver อีกชั้น
```

Current gap ที่ต้องตรวจ/แก้:

```text
dashboard / biDash / videowall อาจยังใช้ active-org camera list หรือ public list
โดยไม่ intersect กับ ResourcePermissionProfile ของ regular member

อาการ:
  -> member เห็น owner ทั้งที่ไม่ได้อยู่ใน orgUnit/profile ที่ให้สิทธิ์
  -> หรือ owner/public count ไม่เปลี่ยนตาม filter
```

#### 0.7.10 Target: ResourceGroup Public/Private Override

ส่วนนี้เป็น requirement ใหม่เมื่อเทียบกับ contract ปัจจุบัน.

Current contract บอกว่า:

```text
ResourceGroup visibility does NOT inherit
และไม่ได้ระบุว่า group public/private จะ overwrite camera.mapVisibility
```

Target behavior ที่ต้องการ:

```text
Admin เปลี่ยน ResourceGroup state public/private
  -> camera ที่อยู่ใน group นั้นถูก flag mapVisibility ตาม state ใหม่

ถ้า public -> private:
  -> camera.mapVisibility ของ device ใน group ถูกเปลี่ยนเป็น private

ถ้า private -> public:
  -> camera.mapVisibility ของ device ใน group ถูกเปลี่ยนเป็น public

ถ้า add device ใหม่เข้า group:
  -> device ได้ mapVisibility ตาม state ปัจจุบันของ group

ถ้า device อยู่หลาย resourceGroups:
  -> ยึด group ที่ถูก add ล่าสุด หรือ group ที่เปลี่ยน state ล่าสุด
  -> ต้องมี timestamp/source สำหรับ last-writer-wins
```

สิ่งที่ต้องเพิ่มใน contract/implementation:

```text
1. นิยาม field ใหม่หรือ semantics ใหม่บน ResourceGroup
   เช่น cameraVisibilityOverride = public/private/none

2. บันทึก source/timestamp ต่อ camera
   เช่น mapVisibilitySource = resourceGroup | manual
   เช่น mapVisibilityUpdatedAt
   เพื่อแยก user ไปเปลี่ยนรายตัวเองกับ group overwrite

3. นิยาม conflict rule:
   manual per-device edit ชนะจนกว่าจะถูก group overwrite ครั้งใหม่?
   หรือ group ล่าสุดชนะเสมอ?

4. PATCH ResourceGroup ต้อง cascade ไป update cameras หรือ enqueue repair

5. Import/add camera เข้า group ต้อง apply current override
```

ถ้าไม่เพิ่ม contract ส่วนนี้ก่อน FE/BE จะตีความไม่เหมือนกันง่ายมาก โดยเฉพาะ
กรณี camera อยู่หลาย groups.

#### 0.7.11 Target: ResourceGroup Icon

BE contract ระบุว่า icon resolve ตาม ResourceGroup แล้ว:

```text
resource_groups.icon
  -> BE resolve เป็น camera.icon ใน camera/map responses
  -> multi-RG ใช้ lex-first RG แล้วเดิน parent
  -> cross-org public auth'd path resolve แล้ว
```

Target FE:

```text
camera list / map / dashboard / biDash / videowall
  -> ใช้ icon ที่ BE ส่งมา
  -> ไม่ต้องเดา icon จาก FE
  -> ถ้า icon null ให้ fallback default
```

Current gap จากภาพ/อาการ:

```text
หน้า ResourceGroups มี config icon/visibility แล้ว
แต่ camera page ยังอาจไม่ render icon by ResourceGroup
หรือ public/private toggle ยังเป็น per-camera อย่างเดียว
```

---

## 1. Vocabulary

| Product word | Current system meaning | Source of truth |
|---|---|---|
| Deployment profile | Runtime mode: `appliance`, `platform`, or `saas` | `DEPLOYMENT_PROFILE` resolved by `klynx-api/config` |
| Appliance | Single-customer / on-prem style deployment. License artifact is the plan authority. | `klynx-api` platform license |
| Tenant | Keycloak realm. Backend derives `tenantId` from JWT issuer realm. | Keycloak |
| Organization / Org | Workspace inside a tenant. FE asks first-time users to create/select one. | `klynx-api.organizations` + Permify org tuples |
| Platform admin | Realm-level role. Canonical value: `platformRole = administrator`. | Keycloak `realm_access.roles[]` |
| Platform user | Authenticated non-admin platform user. Canonical value: `platformRole = user`. | Keycloak `realm_access.roles[]` |
| Org owner/admin/member | Org-level role, independent from platform role. Canonical value: `orgRole = owner/admin/member`. | Permify tuples |
| Permission profile | Resource/menu access profile scoped to org / orgUnit / resources / members. | `klynx-api.permission_profiles` + Permify where applicable |
| License activation | Upload signed artifact on customer deployment. Under `appliance`, it activates platform capabilities and plan authority. | `klynx-api.platform_license` |

Important distinction:

- Keycloak realm separates tenants at identity level.
- Org separates workspaces inside that tenant.
- Org role does not replace platform role, and platform role does not grant resource visibility by itself except for explicit platform-admin bypasses.

---

## 2. High-Level Flow

```text
Login with Keycloak
  -> JWT issuer realm becomes tenantId
  -> BE derives platformRole from realm_access.roles[]
  -> FE stores user session and lists accessible orgs
      -> no orgs: FE opens create-org flow
      -> one or more orgs: FE selects/restores active org
  -> active org is sent as X-Active-Org
  -> BE validates X-Active-Org against Permify organization:view
  -> FE fetches /orgs/effectiveAccess for menu/capabilities
  -> Resource/menu/data access is filtered by effectiveAccess + permission profiles
```

`X-Active-Org` is the runtime org context. It is not a tenant selector. The
tenant is already fixed by the Keycloak realm in the token.

---

## 3. Tenant, Realm, and Org

The backend treats `tenantId = Keycloak realm`. In `AuthBearer`, the realm is
derived from the JWT `iss` claim and saved in request locals as `tenantId`.

Org is a second boundary inside the realm:

- `GET /kapi/orgs/` returns orgs the user can access through Permify lookup.
- FE stores the selected org in `useMyOrganization()`.
- `useApi()` auto-injects `X-Active-Org` from `useMyOrganization()`.
- `ActiveOrg()` validates that non-platform-admin users have `organization:view` on that org.
- Platform admins bypass the Permify active-org check, but still need to send an org id for org-scoped endpoints.

So the isolation stack is:

```text
Keycloak realm / tenant
  -> Org workspace
      -> OrgUnit / resource group / device/resource permission profile
```

---

## 4. First Install and First Org

On first login, FE calls `GET /kapi/orgs/`. If the list is empty, FE opens the
Create Organization dialog. This is expected for a fresh install.

Create org is not a simple role check. It passes through these gates:

| Layer | Gate | Bypass / note |
|---|---|---|
| 1 | Platform license `selfServiceOrgCreationEnabled` | platform admin bypass |
| 2 | Tenant policy `allowSelfServiceOrgCreation` | platform admin bypass |
| 3 | Customer account `selfServiceOrgCreationEnabled` + `maxOrganizations` | no FE-side authority |
| 4 | User policy `canCreateOrganization` and enabled status | no FE-side authority |

The FE `effectiveAccess.canCreateOrganization` value only represents Layer 1
and Layer 2 visibility. A user may see a create affordance but still receive a
403 from Layer 3 or Layer 4. The response uses top-level `code: "FORBIDDEN"`
with `details.cause`:

- `license`
- `tenantPolicy`
- `customer`
- `limit`
- `user`

This is intentional in the contract, but FE currently still has some message
string matching in the create-org dialog. For reliable UX, FE should prefer
`details.cause` when present.

---

## 5. Appliance License Model

In `DEPLOYMENT_PROFILE=appliance`, the deployment is license-driven:

- The effective profile defaults to `appliance` when `DEPLOYMENT_PROFILE` is unset.
- The platform license singleton controls deployment-level policy and caps.
- A signed license artifact populates `platform_license.artifactMeta`.
- Under appliance, license activation is the plan authority for subscription repair.

Expected appliance activation result:

```text
POST /kapi/admin/platformLicense/activate
  -> validate signed artifact
  -> persist platform_license.artifactMeta
  -> seed missing tenant_policies with defaults
  -> repair org subscriptions to license-derived plan
```

Known current risk:

- `docs/plan/applianceActivationCustomerSync.md` documents a pending alignment issue: activation repairs per-org subscriptions, but may leave `customer_accounts.planId` / `maxOrganizations` behind in older state.
- When that drift exists, the user may activate a license successfully, but `POST /orgs` can still fail with `details.cause = "limit"` because org creation reads the customer account cap.
- The intended fix is to cascade appliance activation through `customersvc.UpdatePlan(..., "enterprise")` before the per-org subscription sweep.

Operationally, after activation in appliance mode, check:

- `platform_license.artifactMeta.source == "artifact"`
- `subscriptionRepair.status` is not `partial`
- `GET /kapi/self/customer` returns the expected `planId` and `maxOrganizations`
- `POST /kapi/orgs/` fails only for intentional policy reasons, not stale customer limits

---

## 6. Permission Model

There are three separate role/permission layers:

| Layer | Canonical key | Values | Store | Used for |
|---|---|---|---|---|
| Platform role | `platformRole` | `administrator`, `user` | Keycloak realm role | platform/admin surfaces and bypasses |
| Org role | `orgRole` | `owner`, `admin`, `member` | Permify org tuples | org management capabilities |
| Resource/menu grants | `visibleMenuIds`, permission profile bindings | menu ids, resource ids, relations | Mongo + Permify | sidebar, resource lists, streams |

`GET /kapi/orgs/effectiveAccess` is the main FE contract for runtime UI:

- `visibleMenuIds[]` controls sidebar menu visibility.
- `platformCapabilities.canCreateOrganization` controls org-create visibility.
- `platformCapabilities.canManageSettings` and `canManageSubscription` are platform-admin capabilities.
- `orgCapabilities.canManageOrganization`, `canManageMembers`, `canManageOrgUnits`, `canManageMenuPermissions`, and `canManageResourcePermissions` are derived from active org role and tenant policy.

Resource access is narrower than menu access. For example, a user may see a
page, but camera/edge/kcontrol list and stream endpoints still use resolver
logic from permission profiles.

---

## 7. BE / FE Permission Mismatches to Watch

These are the places most likely to make permission look strange today:

| Area | Current behavior | Risk |
|---|---|---|
| Platform role source | BE `AuthBearer` derives `platformRole` from `realm_access.roles[]`, with flat `role` only as fallback. | Correct canonical model. |
| Older admin middleware | Some BE admin routes still use `RequireRoles(["administrator"])`, which reads flat JWT `role`. | A token with realm role but no flat `role` can pass `AuthBearer` but fail admin endpoints. |
| FE auth store | FE initializes `authStore.user.role` from flat token claim `role`; it does not derive from `realm_access.roles[]`. | Admin menus such as platform license can disappear even though BE would consider the user platform admin. |
| FE admin gates | `licenseAdmin` and `platformLicense` middleware check `auth.user?.role === "administrator"`. | Same flat-role drift risk. |
| First-org dialog | `SelectORG.vue` opens create-org dialog when org list is empty, independent of `effectiveAccess`. | User can be prompted to create an org even when license/customer/user gate later denies it. |
| Create-org error handling | `CreateORG.vue` mostly matches error message text. | It can miss canonical `details.cause` and show vague errors. |
| Add members button | Org page requires both `effectiveAccess.canManageMembers` and `authStore.user?.role === "administrator"`. | Org admin/owner may have org capability but still cannot see Add Members if not platform admin. This may be intended, but should be documented or relaxed. |

Suggested direction:

- FE should derive/store `platformRole` from `/users/profile` or token `realm_access.roles[]`, not only flat `role`.
- FE route/menu guards should read canonical `platformRole` / `effectiveAccess`, not legacy `role`.
- BE admin middleware should be audited for `RequireRoles` versus `platformRole` locals.
- Create-org UI should map `details.cause` directly.

---

## 8. What "Limited Until Activated" Means

Before license activation, the system can still boot with defaults, but appliance
deployments are not fully licensed. Users may be limited by:

- platform license self-service flags
- max customers / max licensed users / max devices
- customer account plan and `maxOrganizations`
- tenant policy
- user policy
- missing org / missing active org
- missing permission profile grants

The most confusing case is successful login plus no org:

```text
User logs in
  -> FE sees no orgs and opens Create Org
  -> POST /orgs hits license/customer/user gates
  -> if appliance activation/customer sync is incomplete, user sees limit/disabled
```

This is not a Keycloak tenant problem by itself. It is usually an org-creation
gate or appliance license/customer-account alignment problem.

---

## 9. Debug Checklist

When permission feels wrong, check in this order:

1. Token / Keycloak
   - JWT `iss` realm is the expected tenant.
   - JWT `realm_access.roles[]` contains `administrator` or another realm role.
   - Flat `role` claim exists if the surface still uses legacy `RequireRoles` or FE `authStore.user.role`.

2. Deployment profile / license
   - `DEPLOYMENT_PROFILE` resolves to `appliance`.
   - `GET /kapi/admin/system/deploymentProfile` shows `effectiveProfile: "appliance"`.
   - `GET /kapi/admin/platformLicense` has `artifactMeta.source: "artifact"` after activation.

3. Customer and org creation gates
   - `GET /kapi/self/customer` has expected `planId` and `maxOrganizations`.
   - Failed `POST /kapi/orgs/` response includes `details.cause`.
   - For `cause = "limit"`, compare org count scoped to `customerAccountId`, not tenant-wide.

4. Active org
   - FE selected org exists in `useMyOrganization()`.
   - Requests include `X-Active-Org`.
   - Non-admin caller has Permify `organization:view` on that org.

5. Runtime access
   - `GET /kapi/orgs/effectiveAccess` returns expected `visibleMenuIds` and capabilities.
   - Org admin/owner cases read `orgCapabilities`, not platform `role`.

6. Resource access
   - Permission profile is active.
   - Profile binds the expected orgUnits/resourceGroups/cameras/edges/memberIds.
   - For streams, non-admin callers must be in resolver result for that camera.

---

## 10. Current Shape Summary

For appliance deployments, the intended mental model is:

```text
Keycloak realm = tenant
Keycloak realm role = platform role
Org = customer workspace inside tenant
Permify org tuple = org role
Permission profile = resource/menu grant
Platform license = appliance plan and capability authority
Customer account = org quota gate input
X-Active-Org = runtime org scope
```

The permission model is sound when each layer is read from its canonical source.
The confusing behavior today mostly comes from legacy flat `role` reads and from
license activation not always aligning customer-account limits in appliance
mode. Those should be treated as cleanup targets, not as a reason to collapse
tenant, org, and permission concepts into one role.
