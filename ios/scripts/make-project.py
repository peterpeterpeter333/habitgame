from pathlib import Path
import hashlib,json
root=Path(__file__).resolve().parents[1];project=root/'QuestForge.xcodeproj';project.mkdir(exist_ok=True)
def ident(label):return hashlib.sha1(label.encode()).hexdigest()[:24].upper()
def ref(label):return ident(label)
objects=[]
def obj(label,body):objects.append(f'{ref(label)} = {{ {body} }};')
sources=['QuestForgeApp.swift','GameView.swift','NativeSaveStore.swift','QuestGameController.swift','QuestNativeBridge.swift']
for name in sources:
 obj(name,f'isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = {name}; sourceTree = "<group>";')
 obj('build:'+name,f'isa = PBXBuildFile; fileRef = {ref(name)};')
for name,kind in [('Web','folder'),('Assets.xcassets','folder.assetcatalog'),('PrivacyInfo.xcprivacy','text.xml'),('Info.plist','text.plist.xml')]:
 obj(name,f'isa = PBXFileReference; lastKnownFileType = {kind}; path = {name}; sourceTree = "<group>";')
 if name!='Info.plist':obj('build:'+name,f'isa = PBXBuildFile; fileRef = {ref(name)};')
obj('product','isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = QuestForge.app; sourceTree = BUILT_PRODUCTS_DIR;')
obj('main',f'isa = PBXGroup; children = ({ref("appgroup")}, {ref("products")}); sourceTree = "<group>";')
obj('appgroup','isa = PBXGroup; path = QuestForgeApp; sourceTree = "<group>"; children = ('+', '.join(ref(n) for n in sources+['Web','Assets.xcassets','PrivacyInfo.xcprivacy','Info.plist'])+');')
obj('products',f'isa = PBXGroup; name = Products; sourceTree = "<group>"; children = ({ref("product")});')
obj('sources','isa = PBXSourcesBuildPhase; buildActionMask = 2147483647; runOnlyForDeploymentPostprocessing = 0; files = ('+', '.join(ref('build:'+n) for n in sources)+');')
obj('resources','isa = PBXResourcesBuildPhase; buildActionMask = 2147483647; runOnlyForDeploymentPostprocessing = 0; files = ('+', '.join(ref('build:'+n) for n in ['Web','Assets.xcassets','PrivacyInfo.xcprivacy'])+');')
obj('frameworks','isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; runOnlyForDeploymentPostprocessing = 0; files = ();')
obj('target',f'isa = PBXNativeTarget; buildConfigurationList = {ref("target-configs")}; buildPhases = ({ref("sources")}, {ref("frameworks")}, {ref("resources")}); buildRules = (); dependencies = (); name = QuestForge; productName = QuestForge; productReference = {ref("product")}; productType = "com.apple.product-type.application";')
for name in ['Debug','Release']:
 common='CLANG_ENABLE_MODULES = YES; CLANG_ENABLE_OBJC_ARC = YES; IPHONEOS_DEPLOYMENT_TARGET = 17.0; SDKROOT = iphoneos; SWIFT_VERSION = 5.0; SWIFT_STRICT_CONCURRENCY = targeted; '
 common+='DEBUG_INFORMATION_FORMAT = dwarf; SWIFT_OPTIMIZATION_LEVEL = "-Onone"; SWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG; ONLY_ACTIVE_ARCH = YES;' if name=='Debug' else 'DEBUG_INFORMATION_FORMAT = "dwarf-with-dsym"; SWIFT_OPTIMIZATION_LEVEL = "-O"; ENABLE_NS_ASSERTIONS = NO; VALIDATE_PRODUCT = YES;'
 obj('project-'+name,f'isa = XCBuildConfiguration; name = {name}; buildSettings = {{ {common} }};')
 target='ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon; CODE_SIGN_STYLE = Automatic; DEVELOPMENT_TEAM = K3MTX6RVB9; CURRENT_PROJECT_VERSION = 2; MARKETING_VERSION = 1.0.0; GENERATE_INFOPLIST_FILE = NO; INFOPLIST_FILE = QuestForgeApp/Info.plist; PRODUCT_BUNDLE_IDENTIFIER = com.peterpeterpeter333.habitgame; PRODUCT_NAME = "$(TARGET_NAME)"; SUPPORTED_PLATFORMS = "iphoneos iphonesimulator"; SUPPORTS_MACCATALYST = NO; SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO; TARGETED_DEVICE_FAMILY = 1; LD_RUNPATH_SEARCH_PATHS = "$(inherited) @executable_path/Frameworks"; '
 obj('target-'+name,f'isa = XCBuildConfiguration; name = {name}; buildSettings = {{ {target} }};')
for scope in ['target','project']:
 obj(scope+'-configs',f'isa = XCConfigurationList; buildConfigurations = ({ref(scope+"-Debug")}, {ref(scope+"-Release")}); defaultConfigurationIsVisible = 0; defaultConfigurationName = Release;')
obj('project',f'isa = PBXProject; attributes = {{ BuildIndependentTargetsInParallel = YES; LastUpgradeCheck = 2700; TargetAttributes = {{ {ref("target")} = {{ CreatedOnToolsVersion = 27.1; ProvisioningStyle = Automatic; }}; }}; }}; buildConfigurationList = {ref("project-configs")}; compatibilityVersion = "Xcode 14.0"; developmentRegion = ja; hasScannedForEncodings = 0; knownRegions = (ja, en, Base); mainGroup = {ref("main")}; productRefGroup = {ref("products")}; projectDirPath = ""; projectRoot = ""; targets = ({ref("target")});')
(project/'project.pbxproj').write_text('// !$*UTF8*$!\n{ archiveVersion = 1; classes = {}; objectVersion = 56; objects = {\n'+'\n'.join(objects)+f'\n}}; rootObject = {ref("project")}; }}\n')
scheme=f'''<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion="2700" version="1.3"><BuildAction parallelizeBuildables="YES" buildImplicitDependencies="YES"><BuildActionEntries><BuildActionEntry buildForTesting="YES" buildForRunning="YES" buildForProfiling="YES" buildForArchiving="YES" buildForAnalyzing="YES"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ref('target')}" BuildableName="QuestForge.app" BlueprintName="QuestForge" ReferencedContainer="container:QuestForge.xcodeproj"/></BuildActionEntry></BuildActionEntries></BuildAction><TestAction buildConfiguration="Debug"/><LaunchAction buildConfiguration="Debug" selectedDebuggerIdentifier="Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier="Xcode.IDEFoundation.Launcher.LLDB" launchStyle="0" useCustomWorkingDirectory="NO" ignoresPersistentStateOnLaunch="NO" debugDocumentVersioning="YES" allowLocationSimulation="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ref('target')}" BuildableName="QuestForge.app" BlueprintName="QuestForge" ReferencedContainer="container:QuestForge.xcodeproj"/></BuildableProductRunnable></LaunchAction><ProfileAction buildConfiguration="Release" shouldUseLaunchSchemeArgsEnv="YES" savedToolIdentifier="" useCustomWorkingDirectory="NO" debugDocumentVersioning="YES"><BuildableProductRunnable runnableDebuggingMode="0"><BuildableReference BuildableIdentifier="primary" BlueprintIdentifier="{ref('target')}" BuildableName="QuestForge.app" BlueprintName="QuestForge" ReferencedContainer="container:QuestForge.xcodeproj"/></BuildableProductRunnable></ProfileAction><AnalyzeAction buildConfiguration="Debug"/><ArchiveAction buildConfiguration="Release" revealArchiveInOrganizer="YES"/></Scheme>'''
p=project/'xcshareddata/xcschemes/QuestForge.xcscheme';p.parent.mkdir(parents=True,exist_ok=True);p.write_text(scheme)
(root/'QuestForgeApp/Assets.xcassets/Contents.json').write_text(json.dumps({'info':{'author':'xcode','version':1}},indent=2))
(root/'QuestForgeApp/Assets.xcassets/AppIcon.appiconset/Contents.json').write_text(json.dumps({'images':[{'filename':'AppIcon-1024.png','idiom':'universal','platform':'ios','size':'1024x1024'}],'info':{'author':'xcode','version':1}},indent=2))
print('Generated QuestForge.xcodeproj')
