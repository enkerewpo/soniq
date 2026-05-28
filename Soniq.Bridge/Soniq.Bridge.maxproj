{
	"name" : "Soniq.Bridge",
	"version" : 1,
	"creationdate" : 0,
	"modificationdate" : 0,
	"viewrect" : [ 0.0, 0.0, 300.0, 500.0 ],
	"autoorganize" : 1,
	"hideprojectwindow" : 0,
	"showdependencies" : 1,
	"autolocalize" : 0,
	"contents" : 	{
		"code" : 		{
			"soniq.bridge.launcher.js" : 			{
				"kind" : "javascript",
				"local" : 1,
				"singleton" : 				{
					"projectrelativepath" : "."
				}
			}
,
			"server.js" : 			{
				"kind" : "javascript",
				"local" : 1,
				"singleton" : 				{
					"projectrelativepath" : "./code"
				}
			}
,
			"max-vst-bridge.js" : 			{
				"kind" : "javascript",
				"local" : 1,
				"singleton" : 				{
					"projectrelativepath" : "./code"
				}
			}
,
			"rpc/vst.js" : 			{
				"kind" : "javascript",
				"local" : 1,
				"singleton" : 				{
					"projectrelativepath" : "./code/rpc"
				}
			}

		}
,
		"patchers" : 		{
			"Soniq.Bridge.amxd" : 			{
				"kind" : "patcher",
				"local" : 1,
				"singleton" : 				{
					"projectrelativepath" : "."
				}
			}

		}

	}
,
	"layout" : 	{

	}
,
	"searchpath" : 	{

	}
,
	"detailsvisible" : 0,
	"amxdtype" : 0,
	"readonly" : 0,
	"devpathtype" : 0,
	"devpath" : ".",
	"sortmode" : 0,
	"viewmode" : 0,
	"includepackages" : 0
}
